import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { type AnyRouteDefinition, Outlet } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { icon } from "@barqjs/ui/shared-icon";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { setServerErrors, useArcForm } from "./form.tsx";
import { DangerZone, SettingsLayout, SettingsSection, settingsStyles } from "./settings.tsx";

const NAVIGATION = [
  {
    label: "Account",
    items: [
      { label: "Profile", to: "/settings/profile" },
      { label: "Security", to: "/settings/security" },
    ],
  },
];

interface ProfileProps {
  saved: string[];
}

function Profile(props: ProfileProps) {
  const form = useArcForm(() => ({
    defaultValues: { name: "Salama Ashoush" },
    onSubmit: ({ value, formApi }) => {
      if (value.name.endsWith("?")) {
        setServerErrors(formApi, { fields: { name: "A name cannot end in a question mark" } });
        return;
      }
      props.saved.push(value.name);
    },
  }));
  return (
    <SettingsSection
      id="profile"
      heading="Profile"
      description="How others see you."
      hint="Shown on your comments."
      form={form}
    >
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
    </SettingsSection>
  );
}

function tree(saved: string[]): AnyRouteDefinition[] {
  return [
    {
      path: "/",
      component: () => (
        <>
          <ConfirmHost />
          <Outlet />
        </>
      ),
      children: [
        { path: "", component: () => <h1>Home</h1> },
        {
          path: "settings",
          component: () => (
            <SettingsLayout navigation={NAVIGATION} back={{ to: "/settings" }}>
              <Outlet />
            </SettingsLayout>
          ),
          children: [
            { path: "profile", component: () => <Profile saved={saved} /> },
            { path: "security", component: () => <p>Security</p> },
          ],
        },
      ],
    },
  ] as never;
}

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("SettingsLayout", () => {
  test("the sections in a named navigation beside the open one, and a way back on a phone", async () => {
    const view = await renderRoute({ routeTree: tree([]), path: "/settings/profile" });
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(slot("settings-layout")?.hasAttribute("data-selected")).toBe(true);
    const back = screen.getByRole("link", { name: "All settings" });
    expect(back.getAttribute("href")).toBe("/settings");
    expect(wears(back.querySelector("svg"), icon.directional)).toBe(true);
    const sheet = collectCss();
    const nav0 = settingsStyles().nav.split(" ");
    expect(nav0.some((one) => sheet.includes(`.${one}`) && sheet.includes("@container"))).toBe(
      true,
    );
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });
});

describe("SettingsSection", () => {
  test("Save waits for a change, saves the section's own form and says it saved", async () => {
    const saved: string[] = [];
    const view = await renderRoute({ routeTree: tree(saved), path: "/settings/profile" });
    const section = screen.getByRole("region", { name: "Profile" });
    const save = within(section).getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled") || save.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    const name = within(section).getByRole("textbox", { name: "Name" });
    await user.type(name, "!");
    await settle();
    await user.click(save);
    await waitFor(() => expect(saved).toEqual(["Salama Ashoush!"]));
    await waitFor(() => expect(within(section).getByRole("status").textContent).toBe("Saved"));
    view.unmount();
  });

  test("a save the server refused keeps its errors and does not say it saved", async () => {
    const saved: string[] = [];
    const view = await renderRoute({ routeTree: tree(saved), path: "/settings/profile" });
    const section = screen.getByRole("region", { name: "Profile" });
    const name = within(section).getByRole("textbox", { name: "Name" });
    await user.type(name, "?");
    await settle();
    await user.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    await settle();
    expect(saved).toEqual([]);
    expect(within(section).queryByRole("status")?.textContent ?? "").not.toBe("Saved");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    view.unmount();
  });

  test("leaving with unsaved changes asks first", async () => {
    const view = await renderRoute({ routeTree: tree([]), path: "/settings/profile" });
    await user.type(screen.getByRole("textbox", { name: "Name" }), "?");
    await settle();
    await user.click(screen.getByRole("link", { name: "Security" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await settle();
    expect(view.state.location().pathname).toBe("/settings/profile");
    view.unmount();
  });
});

describe("DangerZone", () => {
  test("each action asks in the danger tone first, and runs only once confirmed", async () => {
    const ran: string[] = [];
    render(() => (
      <>
        <ConfirmHost />
        <DangerZone
          actions={[
            {
              id: "delete",
              title: "Delete the workspace",
              description: "Every project goes with it.",
              label: "Delete workspace",
              confirm: { title: "Delete the workspace?", confirmLabel: "Delete" },
              onAction: () => void ran.push("delete"),
            },
          ]}
        />
      </>
    ));
    expect(screen.getByRole("region", { name: "Danger zone" })).toBeDefined();
    const button = screen.getByRole("button", { name: "Delete workspace" });
    expect(wears(button, touch.target)).toBe(true);
    await user.click(button);
    await settle();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(ran).toEqual([]);
    user.tap(button);
    await settle();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(ran).toEqual(["delete"]));
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("an action that fails says so beside it rather than escaping unhandled", async () => {
    render(() => (
      <>
        <ConfirmHost />
        <DangerZone
          actions={[
            {
              id: "archive",
              title: "Archive the workspace",
              label: "Archive workspace",
              confirm: { title: "Archive the workspace?", confirmLabel: "Archive" },
              onAction: () => Promise.reject(new Error("invoices are open")),
            },
          ]}
        />
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Archive workspace" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toBe("That did not work. Try again.");
    expect(
      screen.getByRole("button", { name: "Archive workspace" }).hasAttribute("data-pending"),
    ).toBe(false);
  });
});

describe("the settings parts", () => {
  test("run right to left", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <SettingsSection heading="Profile" footer={<button type="button">Go</button>}>
          <p>Fields</p>
        </SettingsSection>
      </Arabic>
    ));
    expect(slot("settings-section")?.closest("[dir=rtl]")).not.toBeNull();
    expect(slot("settings-section-footer")).not.toBeNull();
  });

  test("take a class per part", () => {
    render(() => (
      <SettingsSection
        class="mine"
        heading="Profile"
        description="d"
        footer="f"
        classes={{
          section: "s",
          header: "h",
          heading: "g",
          description: "d",
          body: "b",
          footer: "f",
        }}
      >
        <p>Fields</p>
      </SettingsSection>
    ));
    for (const [name, cls] of [
      ["settings-section", "s"],
      ["settings-section-header", "h"],
      ["settings-section-heading", "g"],
      ["settings-section-description", "d"],
      ["settings-section-body", "b"],
      ["settings-section-footer", "f"],
    ] as const) {
      expect(slot(name)?.classList.contains(cls)).toBe(true);
    }
    expect(slot("settings-section")?.classList.contains("mine")).toBe(true);
  });

  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { DangerZone, SettingsSection } from "<arc>";
      export function Page() {
        return (
          <>
            <SettingsSection heading="Profile" description="How others see you."><p>Fields</p></SettingsSection>
            <DangerZone actions={[{ id: "x", title: "Leave", label: "Leave", confirm: { title: "Leave?" }, onAction: () => {} }]} />
          </>
        );
      }
    `);
    expect(result.container.querySelectorAll("h2")).toHaveLength(2);
    result.unmount();
  });
});

function TwoCards() {
  const name = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
  const slug = useArcForm(() => ({ defaultValues: { slug: "acme" } }));
  return (
    <>
      <SettingsSection id="name" heading="Name" form={name}>
        <name.AppField name="name">{(field) => <field.TextField label="Name" />}</name.AppField>
      </SettingsSection>
      <SettingsSection id="slug" heading="Address" form={slug}>
        <slug.AppField name="slug">{(field) => <field.TextField label="Slug" />}</slug.AppField>
      </SettingsSection>
    </>
  );
}

function areaTree(narrow: "list" | "row"): AnyRouteDefinition[] {
  return [
    {
      path: "/",
      component: () => (
        <>
          <ConfirmHost />
          <Outlet />
        </>
      ),
      children: [
        {
          path: "settings",
          component: () => (
            <SettingsLayout navigation={NAVIGATION} narrow={narrow} back={{ to: "/settings" }}>
              <Outlet />
            </SettingsLayout>
          ),
          children: [
            { path: "profile", component: () => <TwoCards /> },
            { path: "security", component: () => <p>Security</p> },
          ],
        },
      ],
    },
  ] as never;
}

describe("SettingsLayout's area", () => {
  test("asks once before leaving, however many cards hold changes", async () => {
    const view = await renderRoute({ routeTree: areaTree("list"), path: "/settings/profile" });
    await user.type(screen.getByRole("textbox", { name: "Name" }), "!");
    await user.type(screen.getByRole("textbox", { name: "Slug" }), "-co");
    await settle();
    await user.click(screen.getByRole("link", { name: "Security" }));
    await waitFor(() => expect(screen.getAllByRole("alertdialog")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/settings/security"));
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    view.unmount();
  });

  test("narrow as a row: the sections scroll above the open one, with no way back", async () => {
    const view = await renderRoute({ routeTree: areaTree("row"), path: "/settings/profile" });
    expect(slot("settings-layout")?.getAttribute("data-narrow")).toBe("row");
    expect(screen.queryByRole("link", { name: "All settings" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(nav.closest('[data-slot="settings-layout-nav"]')).not.toBeNull();
    view.unmount();
  });
});

describe("SettingsSection's states", () => {
  test("a clean form follows the record when it is fetched again; a changed one keeps its draft", async () => {
    const [record, setRecord] = createSignal({ name: "Acme" });
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
      return (
        <SettingsSection heading="Name" form={form} values={record()}>
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        </SettingsSection>
      );
    });
    await settle();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    setRecord({ name: "Acme Ltd" });
    await settle();
    expect(input.value).toBe("Acme Ltd");
    await user.type(input, "!");
    await settle();
    setRecord({ name: "Acme Group" });
    await settle();
    expect(input.value).toBe("Acme Ltd!");
  });

  test("read only: the fields are disabled and the reason takes Save's place", async () => {
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
      return (
        <SettingsSection heading="Name" form={form} readOnly="Only owners can change these.">
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        </SettingsSection>
      );
    });
    await settle();
    const fields = screen.getByRole("textbox", { name: "Name" }).closest("fieldset");
    expect(fields?.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(slot("settings-section-read-only")?.textContent).toContain("Only owners");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a list slot holds rows edge to edge before the fields", () => {
    render(() => (
      <SettingsSection heading="Notifications" list={<ul aria-label="Rows" />}>
        <p>Fields</p>
      </SettingsSection>
    ));
    const list = slot("settings-section-list") as HTMLElement;
    expect(list.querySelector("ul")).not.toBeNull();
    expect(
      list.compareDocumentPosition(slot("settings-section-body") as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
