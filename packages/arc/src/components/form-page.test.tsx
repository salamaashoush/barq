import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { type AnyRouteDefinition, Outlet } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates, settle } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { ErrorSummary, FormActionBar, RecordFormPage } from "./form-page.tsx";
import { useArcForm } from "./form.tsx";

interface Checked {
  value: string;
}

function required({ value }: Checked): string | undefined {
  return value.trim() === "" ? "Enter this" : undefined;
}

interface Submitted {
  value: Record<string, string>;
  intent: string | undefined;
}

interface Intent {
  intent?: string;
}

const LONG = ["first", "last", "email", "phone", "street", "city"] as const;

interface StudentProps {
  saved: Submitted[];
  fields?: readonly string[];
  onCancel?: () => void;
}

function Student(props: StudentProps) {
  const names = props.fields ?? LONG;
  const form = useArcForm(() => ({
    defaultValues: Object.fromEntries(names.map((name) => [name, ""])) as Record<string, string>,
    onSubmitMeta: {} as Intent,
    onSubmit: ({ value, meta }) => {
      props.saved.push({ value, intent: meta.intent });
    },
  }));
  return (
    <RecordFormPage
      form={form}
      secondary={{ label: "Save and add another", intent: "another" }}
      onCancel={props.onCancel}
      danger={<p>Danger zone</p>}
    >
      {names.map((name) => (
        <form.AppField name={name} validators={{ onSubmit: required }}>
          {(field) => <field.TextField label={name[0]?.toUpperCase() + name.slice(1)} />}
        </form.AppField>
      ))}
    </RecordFormPage>
  );
}

describe("RecordFormPage", () => {
  test("a long form's failed submit opens with a summary that takes focus and links each field", async () => {
    render(() => <Student saved={[]} />);
    await settle();
    await user.type(screen.getByRole("textbox", { name: "First" }), "Salama");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const summary = await waitFor(() => screen.getByRole("alert", { name: "There is a problem" }));
    await waitFor(() => expect(document.activeElement === summary).toBe(true));
    const links = [...summary.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Last: Enter this",
      "Email: Enter this",
      "Phone: Enter this",
      "Street: Enter this",
      "City: Enter this",
    ]);
    await user.click(links[1] as HTMLElement);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Email" }));
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a short form's failed submit puts focus on the first field marked", async () => {
    render(() => <Student saved={[]} fields={["title", "code"]} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    await waitFor(() => expect(document.activeElement === title).toBe(true));
    expect(screen.queryByRole("alert", { name: "There is a problem" })).toBeNull();
  });

  test("the second submit hands its intent to onSubmit", async () => {
    const saved: StudentProps["saved"] = [];
    render(() => <Student saved={saved} fields={["title"]} />);
    await settle();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Algebra");
    await user.click(screen.getByRole("button", { name: "Save and add another" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.intent).toBe("another");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]?.intent).toBeUndefined();
  });

  test("the bar says what is unsaved; Cancel goes where it is told", async () => {
    const cancelled: number[] = [];
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <Student saved={[]} fields={["title"]} onCancel={() => cancelled.push(1)} />
      </Rtl>
    ));
    await settle();
    const bar = document.querySelector('[data-slot="form-action-bar"]') as HTMLElement;
    expect(bar.hasAttribute("data-dirty")).toBe(false);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "A");
    await settle();
    expect(bar.hasAttribute("data-dirty")).toBe(true);
    expect(bar.querySelector('[role="status"]')?.textContent).toContain("Unsaved changes");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelled).toEqual([1]);
    expect(document.body.textContent).toContain("Danger zone");
  });

  test("leaving asks while it has changes, but a save that navigates is not stopped", async () => {
    const tree = [
      {
        path: "/",
        component: () => (
          <>
            <ConfirmHost />
            <Outlet />
          </>
        ),
        children: [
          { path: "", component: () => <h1>Students</h1> },
          {
            path: "new",
            component: () => {
              const form = useArcForm(() => ({
                defaultValues: { title: "" },
                onSubmit: async () => {
                  await view.state.navigate({ to: "/" });
                },
              }));
              return (
                <RecordFormPage form={form}>
                  <form.AppField name="title">
                    {(field) => <field.TextField label="Title" />}
                  </form.AppField>
                  <a href="/">Back</a>
                </RecordFormPage>
              );
            },
          },
        ],
      },
    ] as unknown as AnyRouteDefinition[];
    const view = await renderRoute({ routeTree: tree, path: "/new" });
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Algebra");
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/"));
    expect(screen.queryByRole("alertdialog") === null).toBe(true);
    view.unmount();
  });

  test("a server's form is hydrated in place", async () => {
    const result = await hydrates(`
      import { RecordFormPage, useArcForm } from "<arc>";
      export function Page() {
        const form = useArcForm(() => ({ defaultValues: { title: "Algebra" } }));
        return <RecordFormPage form={form}>
          <form.AppField name="title">{(field) => <field.TextField label="Title" />}</form.AppField>
        </RecordFormPage>;
      }
    `);
    expect(result.container.textContent).toContain("Save");
    result.unmount();
  });
});

describe("FormActionBar", () => {
  test("inside any arc form: Discard puts the fields back, and shows only while there is something to discard", async () => {
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
      return (
        <form.AppForm>
          <form>
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <FormActionBar note={undefined} submitLabel="Save window" />
          </form>
        </form.AppForm>
      );
    });
    await settle();
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    const name = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
    await user.type(name, " Ltd");
    await settle();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await settle();
    expect(name.value).toBe("Acme");
    expect(screen.getByRole("button", { name: "Save window" }).getAttribute("type")).toBe("submit");
  });
});

describe("ErrorSummary", () => {
  test("names the problems and the server's word, and takes a class per part", () => {
    render(() => (
      <>
        <input id="email-control" aria-label="Email" />
        <ErrorSummary
          problems={[{ id: "email-control", label: "Email", message: "Enter an email" }]}
          failure="The server refused the change."
          heading="Fix these"
          classes={{ summary: "mine" }}
        />
      </>
    ));
    const summary = screen.getByRole("alert", { name: "Fix these" });
    expect(summary.classList.contains("mine")).toBe(true);
    expect(summary.textContent).toContain("The server refused the change.");
    expect(screen.getByRole("link", { name: "Email: Enter an email" }).getAttribute("href")).toBe(
      "#email-control",
    );
  });
});
