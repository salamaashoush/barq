import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { accessibleDescription, ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { TagInput } from "./tag-input.tsx";
import {
  IdentifierField,
  SlugField,
  SuggestionField,
  freeSlug,
  slugify,
  toIdentifier,
} from "./text-fields.tsx";

afterEach(() => destroyAnnouncer());

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("IdentifierField", () => {
  test("rewrites each character to the convention as it is typed, keeping the caret", async () => {
    const [name, setName] = createSignal("");
    render(() => (
      <IdentifierField label="Name" convention="upper-snake" value={name()} onChange={setName} />
    ));
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    await user.type(input, "api key");
    await settle();
    expect(name()).toBe("API_KEY");
    expect(input.value).toBe("API_KEY");
    expect(input.selectionStart).toBe(7);
    expect(accessibleDescription(input)).toBe(
      "Capital letters, digits and underscores; anything else becomes an underscore.",
    );
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("each convention, and a description before the rule", async () => {
    expect(toIdentifier("Staging EU", "kebab")).toBe("staging-eu");
    expect(toIdentifier("Order Total", "snake")).toBe("order_total");
    expect(toIdentifier("report (final).pdf", "filename")).toBe("report--final-.pdf");
    render(() => (
      <IdentifierField label="Environment" convention="kebab" description="Seen in URLs." />
    ));
    await settle();
    expect(accessibleDescription(screen.getByRole("textbox"))).toBe(
      "Seen in URLs. Lowercase letters, digits and dashes; anything else becomes a dash.",
    );
  });

  test("reads left to right on a right-to-left page", async () => {
    render(() => (
      <Rtl>
        <IdentifierField label="الاسم" convention="upper-snake" defaultValue="TOKEN" />
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole("textbox").getAttribute("dir")).toBe("ltr");
  });

  test("holds the form's value inside form.AppField, and shows its error once touched", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "" } }));
      read = () => form.state.values.name;
      return (
        <form.AppForm>
          <form.AppField
            name="name"
            validators={{ onChange: ({ value }) => (value === "" ? "Required" : undefined) }}
          >
            {(field) => <field.IdentifierField label="Name" convention="snake" />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox");
    await user.type(input, "My Var");
    await settle();
    expect(read()).toBe("my_var");
    await user.clear(input);
    await settle();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Required")).toBeDefined();
  });
});

describe("slugify", () => {
  test("lowercases, drops accents and joins the rest with single dashes", () => {
    expect(slugify("  Café Zürich!  ")).toBe("cafe-zurich");
    expect(slugify("Acme -- Ops")).toBe("acme-ops");
    expect(slugify("مدرسة")).toBe("");
    expect(freeSlug("acme", ["acme", "acme-2"])).toBe("acme-3");
    expect(freeSlug("acme", [])).toBe("acme");
  });
});

describe("SlugField", () => {
  test("follows the name, stepping past taken slugs, until it is typed over", async () => {
    const [name, setName] = createSignal("Acme");
    const [slug, setSlug] = createSignal("");
    render(() => (
      <SlugField
        label="Address"
        source={name()}
        prefix="acme.app/"
        taken={["acme"]}
        value={slug()}
        onChange={setSlug}
      />
    ));
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Address" });
    expect(input.value).toBe("acme-2");
    expect(slug()).toBe("acme-2");
    expect(screen.getByText("acme.app/")).toBeDefined();
    setName("Acme Labs");
    await settle();
    expect(slug()).toBe("acme-labs");
    await user.clear(input);
    await user.type(input, "Labs HQ ");
    await settle();
    expect(input.value).toBe("labs-hq-");
    setName("Something else");
    await settle();
    expect(slug()).toBe("labs-hq-");
    input.blur();
    await settle();
    expect(slug()).toBe("labs-hq");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("emptied, it follows the name again", async () => {
    const [slug, setSlug] = createSignal("custom");
    render(() => <SlugField label="Address" source="Acme" value={slug()} onChange={setSlug} />);
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox");
    expect(input.value).toBe("custom");
    await user.clear(input);
    await settle();
    expect(slug()).toBe("acme");
  });

  test("asks whether a slug is free once typing pauses, and holds a taken one as an error", async () => {
    const asked: string[] = [];
    render(() => (
      <SlugField
        label="Address"
        defaultValue="taken"
        checkAvailability={(value) => {
          asked.push(value);
          return Promise.resolve(value !== "taken");
        }}
      />
    ));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Checking the address…");
    await new Promise((resolve) => setTimeout(resolve, 450));
    await settle();
    expect(asked).toEqual(["taken"]);
    const input = screen.getByRole<HTMLInputElement>("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("taken is taken. Try another.")).toBeDefined();
    await user.clear(input);
    await user.type(input, "fresh");
    await new Promise((resolve) => setTimeout(resolve, 450));
    await settle();
    expect(asked).toEqual(["taken", "fresh"]);
    expect(screen.getByRole("status").textContent).toBe("fresh is free.");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  test("collapsed, it reads as a sentence until Change is pressed", async () => {
    render(() => <SlugField label="Address" source="Acme" prefix="/" collapsed />);
    await settle();
    expect(screen.queryByRole("textbox")).toBeNull();
    const change = screen.getByRole("button", { name: "Change" });
    expect(accessibleDescription(change)).toBe("Its address is /acme.");
    await user.click(change);
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Address" });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("acme");
  });

  test("the address reads left to right in a right-to-left form", async () => {
    render(() => (
      <Rtl>
        <SlugField label="العنوان" source="Acme" prefix="acme.app/" />
      </Rtl>
    ));
    await settle();
    expect(document.querySelector('[data-slot="slug-field-group"]')?.getAttribute("dir")).toBe(
      "ltr",
    );
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "Northwind", slug: "" } }));
      read = () => form.state.values.slug;
      return (
        <form.AppForm>
          <form.AppField name="slug">
            {(field) => <field.SlugField label="Address" source="Northwind" />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(read()).toBe("northwind");
  });
});

describe("SuggestionField", () => {
  const GROUPS = ["Website", "API", "Workers"];

  test("offers what is in use and keeps what is typed when it matches none", async () => {
    const [group, setGroup] = createSignal("");
    render(() => (
      <SuggestionField label="Group" suggestions={GROUPS} value={group()} onChange={setGroup} />
    ));
    await settle();
    const input = screen.getByRole<HTMLInputElement>("combobox", { name: "Group" });
    await user.type(input, "Web");
    await settle();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Website"]);
    await user.keyboard("{ArrowDown}{Enter}");
    await settle();
    expect(group()).toBe("Website");
    expect(input.value).toBe("Website");
    await user.clear(input);
    await user.type(input, "Billing");
    await settle();
    await user.keyboard("{Escape}");
    input.blur();
    await settle();
    expect(group()).toBe("Billing");
    expect(input.value).toBe("Billing");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("holds the form's value and submits the text under its name", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { group: "API" } }));
      read = () => form.state.values.group;
      return (
        <form.AppForm>
          <form.AppField name="group">
            {(field) => <field.SuggestionField label="Group" suggestions={GROUPS} name="group" />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    const input = screen.getByRole<HTMLInputElement>("combobox");
    expect(input.value).toBe("API");
    await user.type(input, "s");
    await settle();
    expect(read()).toBe("APIs");
  });
});

describe("TagInput line", () => {
  test("a comma-separated line, normalised and checked when left", async () => {
    const [hosts, setHosts] = createSignal<readonly string[]>(["a.example.com"]);
    render(() => (
      <TagInput
        line
        label="Hosts"
        value={hosts()}
        onChange={setHosts}
        normalize={(host) => host.trim().toLowerCase()}
        validate={(host) => (host.includes(".") ? undefined : `${host} is not a host name`)}
      />
    ));
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Hosts" });
    expect(input.value).toBe("a.example.com");
    await user.clear(input);
    await user.type(input, "B.Example.com,  localhost, c.example.com");
    input.blur();
    await settle();
    expect(hosts()).toEqual(["b.example.com", "c.example.com"]);
    expect(input.value).toBe("b.example.com, c.example.com, localhost");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("localhost is not a host name")).toBeDefined();
    await user.clear(input);
    await user.type(input, "d.example.com{Enter}");
    await settle();
    expect(hosts()).toEqual(["d.example.com"]);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("text taking its own direction", () => {
  test("a text field and a textarea follow what is typed; an empty one keeps the page's", async () => {
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "", bio: "مرحبا", email: "" } }));
      return (
        <Rtl>
          <form.AppForm>
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <form.AppField name="bio">
              {(field) => <field.TextareaField label="Bio" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField label="Email" type="email" />}
            </form.AppField>
          </form.AppForm>
        </Rtl>
      );
    });
    await settle();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    expect(name.hasAttribute("dir")).toBe(false);
    expect(screen.getByRole("textbox", { name: "Bio" }).getAttribute("dir")).toBe("rtl");
    await user.type(name, "Salama");
    await settle();
    expect(name.getAttribute("dir")).toBe("ltr");
    await user.type(screen.getByRole("textbox", { name: "Email" }), "a@example.com");
    await settle();
    expect(screen.getByRole("textbox", { name: "Email" }).hasAttribute("dir")).toBe(false);
  });
});

describe("text fields on the server", () => {
  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { IdentifierField, SlugField, SuggestionField, TagInput } from "<arc>";
      export function Page() {
        return (
          <div>
            <IdentifierField label="Name" convention="upper-snake" defaultValue="API_KEY" />
            <SlugField label="Address" source="Acme Labs" prefix="acme.app/" />
            <SlugField label="Short" source="Acme" collapsed />
            <SuggestionField label="Group" suggestions={["Website", "API"]} defaultValue="API" />
            <TagInput line label="Hosts" defaultValue={["a.example.com", "b.example.com"]} />
          </div>
        );
      }
    `);
    const inputs = [...result.container.querySelectorAll("input")].map((input) => input.value);
    expect(inputs).toContain("API_KEY");
    expect(inputs).toContain("acme-labs");
    expect(inputs).toContain("a.example.com, b.example.com");
    expect(result.container.textContent).toContain("Its address is acme.");
    result.unmount();
  });
});
