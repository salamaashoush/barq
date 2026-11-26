import { describe, expect, test } from "bun:test";
import { type ParentProps, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import {
  type JsonSchema,
  JsonSchemaFields,
  jsonSchemaDefs,
  jsonSchemaExample,
  jsonSchemaTypeLabel,
} from "./json-schema.tsx";

const DEFS: Record<string, JsonSchema> = {
  Check: {
    type: "object",
    required: ["name", "kind"],
    properties: {
      name: { type: "string", description: "What the check is called." },
      kind: { type: "string", enum: ["http", "browser"] },
      interval: { type: "integer", default: 60, description: "Seconds between runs." },
      tags: { type: "array", items: { type: "string" } },
      labels: { type: "object", additionalProperties: { type: "string" } },
      owner: { anyOf: [{ $ref: "#/$defs/Person" }, { type: "null" }] },
      id: { type: "string", format: "uuid" },
      parent: { $ref: "#/$defs/Check", description: "The check this one follows." },
      request: {
        oneOf: [
          {
            type: "object",
            required: ["kind", "url"],
            properties: { kind: { const: "http" }, url: { type: "string", format: "uri" } },
          },
          {
            type: "object",
            title: "Script",
            required: ["source"],
            properties: { source: { type: "string" } },
          },
        ],
      },
    },
  },
  Person: {
    type: "object",
    required: ["email"],
    properties: { email: { type: "string", format: "email" }, name: { type: "string" } },
  },
};

const ROOT: JsonSchema = { $ref: "#/$defs/Check", $defs: DEFS };

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("jsonSchemaTypeLabel", () => {
  test("names a value in a few words", () => {
    const check = DEFS.Check as JsonSchema;
    const props = check.properties ?? {};
    expect(jsonSchemaTypeLabel(props.tags as JsonSchema, DEFS)).toBe("array of string");
    expect(jsonSchemaTypeLabel(props.labels as JsonSchema, DEFS)).toBe("map of string");
    expect(jsonSchemaTypeLabel(props.owner as JsonSchema, DEFS)).toBe("Person or null");
    expect(jsonSchemaTypeLabel(props.id as JsonSchema, DEFS)).toBe("string (uuid)");
    expect(jsonSchemaTypeLabel({ type: ["integer", "null"] }, DEFS)).toBe("integer or null");
    expect(jsonSchemaTypeLabel({ $ref: "#/$defs/Check" }, DEFS)).toBe("Check");
    expect(jsonSchemaTypeLabel({}, DEFS)).toBe("any");
    expect(jsonSchemaTypeLabel(props.request as JsonSchema, DEFS)).toBe("one of several");
  });

  test("finds the definitions of a schema and of an OpenAPI document", () => {
    expect(Object.keys(jsonSchemaDefs(ROOT))).toEqual(["Check", "Person"]);
    expect(Object.keys(jsonSchemaDefs({ components: { schemas: { A: {} } } }))).toEqual(["A"]);
  });
});

describe("jsonSchemaExample", () => {
  test("required fields, enums, formats and the first variant, a cycle cut short", () => {
    expect(jsonSchemaExample(ROOT, DEFS)).toEqual({ name: "string", kind: "http" });
    expect(jsonSchemaExample((DEFS.Check as JsonSchema).properties?.request ?? {}, DEFS)).toEqual({
      kind: "http",
      url: "https://example.com/",
    });
    expect(jsonSchemaExample({ $ref: "#/$defs/Person" }, DEFS)).toEqual({
      email: "ada@example.com",
    });
    expect(jsonSchemaExample({ type: "array", items: { type: "integer" } })).toEqual([0]);
    expect(jsonSchemaExample({ type: "string", example: "acme" })).toBe("acme");
    expect(jsonSchemaExample({ type: "boolean", default: true })).toBe(true);
    const loop: Record<string, JsonSchema> = {
      Node: { type: "object", required: ["next"], properties: { next: { $ref: "#/$defs/Node" } } },
    };
    expect(jsonSchemaExample({ $ref: "#/$defs/Node" }, loop)).toEqual({ next: {} });
  });
});

describe("JsonSchemaFields", () => {
  test("lists required fields first with type, values and default, and opens nesting in place", async () => {
    render(() => <JsonSchemaFields schema={ROOT} anchor={(name) => `key-${name}`} />);
    const names = [
      ...document.querySelectorAll(
        '[data-slot="json-schema-fields"] > li > div > [data-slot="json-schema-name"]',
      ),
    ].map((one) => one.textContent);
    expect(names).toEqual([
      "name",
      "kind",
      "interval",
      "tags",
      "labels",
      "owner",
      "id",
      "parent",
      "request",
    ]);
    const kind = document.getElementById("key-kind");
    expect(kind?.textContent).toContain("Required");
    expect(kind?.querySelector('[data-slot="json-schema-values"]')?.textContent).toBe(
      'One of "http", "browser"',
    );
    expect(document.getElementById("key-interval")?.textContent).toContain("Default 60");
    expect(document.getElementById("key-parent")?.textContent).toContain(
      "The check this one follows.",
    );

    const owner = screen.getByRole("button", { name: "Show 2 properties" });
    expect(owner.getAttribute("aria-expanded")).toBe("false");
    await user.click(owner);
    flush();
    expect(owner.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("key-owner")?.textContent).toContain("email");

    const shapes = screen.getByRole("button", { name: "Show its 2 shapes" });
    await user.click(shapes);
    flush();
    const http = screen.getByRole("button", { name: 'kind = "http"' });
    expect(screen.getByRole("button", { name: "Script" })).toBeDefined();
    await user.click(http);
    flush();
    expect(document.getElementById("key-request")?.textContent).toContain("string (uri)");
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("a schema that refers to itself opens once and then is named", async () => {
    render(() => <JsonSchemaFields schema={ROOT} />);
    const parent = [...document.querySelectorAll('[data-slot="json-schema-field"]')].find(
      (one) => one.querySelector('[data-slot="json-schema-name"]')?.textContent === "parent",
    );
    expect(parent?.querySelector('[data-slot="json-schema-type"]')?.textContent).toBe("Check");
    expect(parent?.querySelector('[data-slot="json-schema-toggle"]')).toBeNull();
  });

  test("a schema with no fields is its type; a description can be drawn as the app likes", () => {
    const { container } = render(() => (
      <div>
        <JsonSchemaFields schema={{ type: "string" }} />
        <JsonSchemaFields
          schema={{
            type: "object",
            properties: { a: { type: "string", description: "Use `x`." } },
          }}
          renderDescription={(text) => <em>{text.toUpperCase()}</em>}
        />
      </div>
    ));
    expect(container.querySelector('[data-slot="json-schema-plain"]')?.textContent).toBe("string");
    expect(container.querySelector("em")?.textContent).toBe("USE `X`.");
  });

  test("names and types stay left to right on a right-to-left page", () => {
    render(() => (
      <Rtl>
        <JsonSchemaFields schema={{ type: "object", properties: { region: { type: "string" } } }} />
      </Rtl>
    ));
    expect(document.querySelector('[data-slot="json-schema-name"]')?.getAttribute("dir")).toBe(
      "ltr",
    );
  });

  test("is hydrated in place", async () => {
    const result = await hydrates(`
      import { JsonSchemaFields } from "<arc>";
      const schema = {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "The name." },
          kind: { type: "string", enum: ["http", "tcp"], default: "http" },
          owner: { type: "object", properties: { email: { type: "string" } } },
        },
      };
      export function Page() {
        return <JsonSchemaFields schema={schema} anchor={(name) => "key-" + name} />;
      }
    `);
    expect(result.container.querySelector("#key-kind")?.textContent).toContain("Default");
    result.unmount();
  });
});
