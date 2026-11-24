import { describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { type AnyRouteDefinition, Outlet } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { icon } from "@barqjs/ui/shared-icon";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { useArcForm } from "./form.tsx";
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

function Profile(props: { saved: string[] }) {
  const form = useArcForm(() => ({
    defaultValues: { name: "Salama Ashoush" },
    onSubmit: ({ value }) => {
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
});

describe("the settings parts", () => {
  test("run right to left", () => {
    function Arabic(props: { children?: Child }) {
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
