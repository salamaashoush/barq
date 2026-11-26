import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { Button } from "@barqjs/ui/button";

import { hydrates, settle } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { FormDialog } from "./form-dialog.tsx";
import { FormSheet } from "./form-sheet.tsx";
import { setServerErrors, useArcForm } from "./form.tsx";

interface IncidentProps {
  opened?: string[];
  fail?: boolean;
  result?: boolean;
  loading?: boolean;
  loadError?: string;
}

function Incident(props: IncidentProps) {
  const form = useArcForm(() => ({
    defaultValues: { title: "" },
    onSubmit: ({ value, formApi }) => {
      if (props.fail === true) {
        setServerErrors(formApi, { fields: { title: "An open incident has that title" } });
        return;
      }
      props.opened?.push(value.title);
    },
  }));
  return (
    <>
      <FormDialog
        form={form}
        heading="Open an incident"
        description="Everyone on call hears of it."
        trigger={<Button>Open incident</Button>}
        submitLabel="Open"
        loading={props.loading}
        loadError={props.loadError}
        result={props.result === true ? () => <p>INC-42 is open.</p> : undefined}
      >
        <form.AppField
          name="title"
          validators={{ onChange: ({ value }) => (value === "" ? "Required" : undefined) }}
        >
          {(field) => <field.TextField label="Title" />}
        </form.AppField>
      </FormDialog>
      <ConfirmHost />
    </>
  );
}

function dialog(): HTMLElement | null {
  return screen.queryByRole("dialog", { name: "Open an incident" });
}

async function open(): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Open incident" }));
  await settle();
}

describe("FormDialog", () => {
  test("its trigger opens a dialog holding the form, Save and Cancel at its foot", async () => {
    render(() => <Incident />);
    await open();
    const box = dialog() as HTMLElement;
    const form = box.querySelector("form") as HTMLFormElement;
    expect(form.contains(screen.getByRole("textbox", { name: "Title" }))).toBe(true);
    const submit = screen.getByRole("button", { name: "Open" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(submit.getAttribute("form")).toBe(form.id);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("submits, then closes", async () => {
    const opened: string[] = [];
    render(() => <Incident opened={opened} />);
    await open();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Checkout is down");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(opened).toEqual(["Checkout is down"]));
    await waitFor(() => expect(dialog() === null).toBe(true));
  });

  test("a refused submit stays open with focus on the field it marked", async () => {
    render(() => <Incident fail />);
    await open();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.type(title, "Checkout is down");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(title.getAttribute("aria-invalid")).toBe("true"));
    await waitFor(() => expect(document.activeElement === title).toBe(true));
    expect(dialog() === null).toBe(false);
  });

  test("closing with a change asks first, by Escape or Cancel", async () => {
    render(() => <Incident />);
    await open();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Slow");
    await settle();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog") === null).toBe(true));
    expect(dialog() === null).toBe(false);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await settle();
    await waitFor(() => expect(dialog() === null).toBe(true));
  });

  test("while its record loads: skeletons and Save held; a failed load says why", async () => {
    const [loading, setLoading] = createSignal(true);
    render(() => <Incident loading={loading()} />);
    await open();
    expect(screen.getByRole("status", { name: "Loading" })).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open" }).hasAttribute("disabled")).toBe(true);
    expect(dialog()?.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    setLoading(false);
    await settle();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeDefined();
  });

  test("a load that failed stands in for the fields", async () => {
    render(() => <Incident loadError="The policy was deleted." />);
    await open();
    expect(dialog()?.textContent).toContain("This could not be loaded");
    expect(dialog()?.textContent).toContain("The policy was deleted.");
    expect(screen.getByRole("button", { name: "Open" }).hasAttribute("disabled")).toBe(true);
  });

  test("with a result, a successful submit shows it in place of the fields, and Done closes", async () => {
    const opened: string[] = [];
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <Incident opened={opened} result />
      </Rtl>
    ));
    await open();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Checkout is down");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(dialog()?.textContent).toContain("INC-42 is open."));
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(dialog() === null).toBe(true));
    expect(screen.queryByRole("alertdialog") === null).toBe(true);
  });

  test("a server's closed dialog and its trigger are hydrated in place", async () => {
    const result = await hydrates(`
      import { FormDialog, useArcForm } from "<arc>";
      import { Button } from "@barqjs/ui/button";
      export function Page() {
        const form = useArcForm(() => ({ defaultValues: { title: "" } }));
        return <FormDialog form={form} heading="New key" trigger={<Button>New key</Button>}>
          <form.AppField name="title">{(field) => <field.TextField label="Name" />}</form.AppField>
        </FormDialog>;
      }
    `);
    expect(result.container.textContent).toContain("New key");
    result.unmount();
  });
});

describe("FormSheet's draft line and loading", () => {
  test("a status line in the foot, read politely, and skeletons while its record loads", async () => {
    const [loading, setLoading] = createSignal(true);
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
      return (
        <FormSheet
          form={form}
          heading="Edit rubric"
          defaultOpen
          status="Draft kept on this device"
          loading={loading()}
        >
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        </FormSheet>
      );
    });
    await settle();
    const line = document.querySelector('[data-slot="form-sheet-status"]') as HTMLElement;
    expect(line.textContent).toBe("Draft kept on this device");
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("status", { name: "Loading" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
    setLoading(false);
    await settle();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDefined();
  });
});
