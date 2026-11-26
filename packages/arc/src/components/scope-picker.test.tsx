import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import {
  accessibleDescription,
  ariaViolations,
  render,
  screen,
  user,
  waitFor,
} from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { PermissionScopePicker, type ScopeGroup, scopeSummary } from "./scope-picker.tsx";

afterEach(() => destroyAnnouncer());

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function ticked(element: HTMLElement): boolean {
  return element.getAttribute("aria-checked") === "true" || (element as HTMLInputElement).checked;
}

const SCOPES: readonly ScopeGroup[] = [
  {
    label: "Checks",
    scopes: [
      {
        value: "checks:read",
        description: "Checks, runs and reports.",
        agentDescription: "Read checks.",
      },
      {
        value: "checks:write",
        description: "Create, change and delete checks.",
        implies: ["checks:read"],
      },
      { value: "runs:trigger", description: "Run checks now.", implies: ["checks:read"] },
    ],
  },
  {
    label: "Incidents",
    scopes: [
      { value: "incidents:read", description: "Incidents and their timelines." },
      {
        value: "incidents:write",
        description: "Acknowledge and resolve.",
        implies: ["incidents:read"],
      },
    ],
  },
  {
    label: "Admin",
    scopes: [{ value: "admin", description: "Everything.", impliesAll: true }],
  },
];

describe("PermissionScopePicker", () => {
  test("a checkbox per scope, grouped, held in the groups' order", async () => {
    const [scopes, setScopes] = createSignal<readonly string[]>([]);
    render(() => (
      <PermissionScopePicker label="Scopes" groups={SCOPES} value={scopes()} onChange={setScopes} />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Scopes" })).toBeDefined();
    expect(screen.getByRole("group", { name: "Checks" })).toBeDefined();
    await user.click(screen.getByRole("checkbox", { name: "incidents:write" }));
    await user.click(screen.getByRole("checkbox", { name: "checks:read" }));
    await settle();
    expect(scopes()).toEqual(["checks:read", "incidents:write"]);
    const read = screen.getByRole("checkbox", { name: "checks:read" });
    expect(accessibleDescription(read)).toBe("Checks, runs and reports.");
    read.focus();
    await user.keyboard(" ");
    await settle();
    expect(scopes()).toEqual(["incidents:write"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("scopes beyond the reader's role show disabled with why; agents read their own words", async () => {
    render(() => (
      <PermissionScopePicker
        label="Scopes"
        groups={SCOPES}
        allowed={["checks:read", "checks:write"]}
        audience="agent"
        defaultValue={["checks:read", "legacy:scope"]}
      />
    ));
    await settle();
    const admin = screen.getByRole("checkbox", { name: "admin" });
    expect(admin.hasAttribute("disabled") || admin.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    expect(accessibleDescription(admin)).toContain("Your role here does not include this.");
    expect(accessibleDescription(screen.getByRole("checkbox", { name: "checks:read" }))).toBe(
      "Read checks.",
    );
    await user.click(screen.getByRole("checkbox", { name: "checks:write" }));
    await settle();
    const hidden = [...document.querySelectorAll<HTMLInputElement>('input[type="hidden"]')];
    expect(hidden).toHaveLength(0);
    expect(ticked(screen.getByRole("checkbox", { name: "checks:write" }))).toBe(true);
  });

  test("required, it asks for one once the form is submitted", async () => {
    function Form() {
      const form = useArcForm(() => ({ defaultValues: { scopes: [] as readonly string[] } }));
      return (
        <form.AppForm>
          <form
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.AppField name="scopes">
              {(field) => <field.PermissionScopePicker label="Scopes" groups={SCOPES} isRequired />}
            </form.AppField>
            <button type="submit">Save</button>
          </form>
        </form.AppForm>
      );
    }
    render(() => <Form />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Pick at least one.")).toBeDefined());
    expect(screen.getByRole("group", { name: "Scopes" }).getAttribute("aria-invalid")).toBe("true");
  });

  test("read only, each group lists what is granted", async () => {
    render(() => (
      <Rtl>
        <PermissionScopePicker
          label="النطاقات"
          groups={SCOPES}
          defaultValue={["checks:write"]}
          isReadOnly
        />
      </Rtl>
    ));
    await settle();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("checks:write")).toBeDefined();
  });

  test("a set said briefly: implied scopes unsaid, admin alone", () => {
    expect(scopeSummary(["checks:read", "checks:write", "incidents:read"], SCOPES)).toEqual([
      "checks:write",
      "incidents:read",
    ]);
    expect(scopeSummary(["checks:read", "runs:trigger"], SCOPES)).toEqual(["runs:trigger"]);
    expect(scopeSummary(["checks:read", "admin"], SCOPES)).toEqual(["admin"]);
  });
});

describe("scope and credential pickers on the server", () => {
  test("are hydrated in place", async () => {
    const result = await hydrates(`
      import { CredentialBindingList, PermissionScopePicker } from "<arc>";
      const GROUPS = [{ label: "Checks", scopes: [{ value: "checks:read" }, { value: "checks:write" }] }];
      export function Page() {
        return (
          <div>
            <PermissionScopePicker label="Scopes" groups={GROUPS} defaultValue={["checks:read"]} allowed={["checks:read"]} />
            <CredentialBindingList label="Secrets" credentials={[{ name: "TOKEN" }]} existing={["TOKEN"]} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("checks:write");
    result.unmount();
  });
});
