import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { Link } from "@barqjs/router";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { ConfirmHost } from "./confirm.tsx";
import { FormSheet } from "./form-sheet.tsx";
import { useArcForm } from "./form.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

interface Edit {
  saved?: string[];
  fail?: boolean;
}

function Editor(props: Edit) {
  const form = useArcForm(() => ({
    defaultValues: { name: "Acme" },
    onSubmit: ({ value }) => {
      props.saved?.push(value.name);
    },
  }));
  return (
    <>
      <FormSheet form={form} heading="Edit customer" defaultOpen>
        <form.AppField
          name="name"
          validators={{ onChange: ({ value }) => (value === "" ? "Required" : undefined) }}
        >
          {(field) => <field.TextField label="Name" />}
        </form.AppField>
        <form.FormError />
      </FormSheet>
      <ConfirmHost />
    </>
  );
}

const sheet = (): HTMLElement | null => screen.queryByRole("dialog", { name: "Edit customer" });

describe("FormSheet", () => {
  test("is a dialog holding the form, with Save and Cancel at its foot", async () => {
    render(() => <Editor />);
    await settle();
    const dialog = sheet() as HTMLElement;
    const form = dialog.querySelector("form") as HTMLFormElement;
    expect(form.contains(screen.getByRole("textbox", { name: "Name" }))).toBe(true);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.getAttribute("type")).toBe("submit");
    expect(save.getAttribute("form")).toBe(form.id);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("closes once it saves", async () => {
    const saved: string[] = [];
    render(() => <Editor saved={saved} />);
    await settle();
    await user.type(screen.getByRole("textbox", { name: "Name" }), " Ltd");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toEqual(["Acme Ltd"]));
    await settle();
    await waitFor(() => expect(sheet()).toBeNull());
  });

  test("an invalid form stays open with its submit disabled", async () => {
    render(() => <Editor />);
    await settle();
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await settle();
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
    expect(sheet()).not.toBeNull();
  });

  test("a clean form closes on Cancel without asking", async () => {
    render(() => <Editor />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(sheet()).toBeNull());
  });

  test("Escape on a dirty form asks first; keeping it keeps what was typed", async () => {
    render(() => <Editor />);
    await settle();
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, " Ltd");
    await settle();
    await user.keyboard("{Escape}");
    await settle();
    const ask = await waitFor(() => screen.getByRole("alertdialog"));
    expect(ask.textContent).toContain("Discard unsaved changes?");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await settle();
    expect(sheet()).not.toBeNull();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe("Acme Ltd");
  });

  test("discarding closes it and puts the form back", async () => {
    const [open, setOpen] = createSignal(true);
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
      return (
        <>
          <FormSheet form={form} heading="Edit customer" open={open()} onOpenChange={setOpen}>
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
          </FormSheet>
          <ConfirmHost />
        </>
      );
    });
    await settle();
    await user.type(screen.getByRole("textbox", { name: "Name" }), " Ltd");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(open()).toBe(false));
    await waitFor(() => expect(sheet()).toBeNull());

    setOpen(true);
    await settle();
    const input = await waitFor(() =>
      screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }),
    );
    expect(input.value).toBe("Acme");
  });

  test("leaving the page with the sheet dirty asks through the router", async () => {
    function Page() {
      const form = useArcForm(() => ({ defaultValues: { name: "Acme" } }));
      return (
        <>
          <Link to="/elsewhere">Elsewhere</Link>
          <FormSheet form={form} heading="Edit customer" param="edit">
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
          </FormSheet>
          <ConfirmHost />
        </>
      );
    }
    const view = await renderRoute({
      routeTree: [
        { path: "/customers", component: Page },
        { path: "/elsewhere", component: () => <p>Elsewhere</p> },
      ] as never,
      path: "/customers?edit=1",
    });
    await settle();
    expect(sheet()).not.toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Name" }), " Ltd");
    await settle();
    void view.state.navigate("/elsewhere");
    await settle();
    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await settle();
    expect(view.state.location().pathname).toBe("/customers");
    view.unmount();
  });
});
