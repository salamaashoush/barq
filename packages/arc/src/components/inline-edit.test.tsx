import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { accessibleName, ariaViolations, fireEvent, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { InlineEdit, type InlineOption, InlineSelect } from "./inline-edit.tsx";

afterEach(() => destroyAnnouncer());

function display(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="inline-edit-display"]') as HTMLElement;
}

function editor(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(
    '[data-slot="inline-edit-input"]',
  ) as HTMLInputElement;
}

describe("InlineEdit", () => {
  test("reads as its text, opens on press, saves on Enter and comes back to the text", async () => {
    const [title, setTitle] = createSignal("Launch plan");
    render(() => <InlineEdit label="Title" value={title()} onSave={setTitle} />);
    await settle();
    expect(accessibleName(display())).toBe("Title: Launch plan");
    await user.click(display());
    await settle();
    expect(document.activeElement).toBe(editor());
    expect(accessibleName(editor())).toBe("Title");
    await user.clear(editor());
    await user.type(editor(), "Launch day{Enter}");
    await settle();
    expect(title()).toBe("Launch day");
    expect(document.activeElement).toBe(display());
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Escape puts the text back, and leaving the field saves", async () => {
    const saved: string[] = [];
    render(() => (
      <InlineEdit label="Title" value="Draft" onSave={(next) => void saved.push(next)} />
    ));
    await settle();
    await user.click(display());
    await settle();
    await user.type(editor(), " two");
    await user.keyboard("{Escape}");
    await settle();
    expect(saved).toEqual([]);
    expect(display().textContent).toContain("Draft");
    await user.click(display());
    await settle();
    await user.type(editor(), " three");
    editor().blur();
    await settle();
    expect(saved).toEqual(["Draft three"]);
  });

  test("pending while the save is out, and open with the reason when it fails", async () => {
    let fail: (reason: unknown) => void = () => undefined;
    render(() => (
      <InlineEdit
        label="Title"
        value="Draft"
        onSave={() =>
          new Promise((_, reject) => {
            fail = reject;
          })
        }
      />
    ));
    await settle();
    await user.click(display());
    await settle();
    await user.type(editor(), "!{Enter}");
    await settle();
    expect(editor().readOnly).toBe(true);
    expect(editor().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status", { name: "Saving…" })).toBeDefined();
    fail(new Error("That title is in use."));
    await settle();
    await settle();
    expect(editor().value).toBe("Draft!");
    expect(editor().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("That title is in use.");
  });

  test("several lines: Enter breaks a line and Ctrl+Enter saves; empty shows the placeholder", async () => {
    const [notes, setNotes] = createSignal("");
    render(() => (
      <InlineEdit
        label="Notes"
        value={notes()}
        onSave={setNotes}
        multiline
        placeholder="Add notes"
      />
    ));
    await settle();
    expect(display().textContent).toContain("Add notes");
    await user.click(display());
    await settle();
    expect(editor().tagName).toBe("TEXTAREA");
    await user.type(editor(), "one{Enter}");
    await settle();
    expect(notes()).toBe("");
    editor().value = "one\ntwo";
    fireEvent.input(editor());
    await settle();
    expect(notes()).toBe("");
    await user.keyboard("{Enter}", { ctrlKey: true });
    await settle();
    expect(notes()).toBe("one\ntwo");
  });

  test("refuses what validate refuses, and takes the text's direction", async () => {
    const saved: string[] = [];
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <InlineEdit
          label="Name"
          value="Report"
          validate={(next) => (next.trim() === "" ? "A name is needed." : undefined)}
          onSave={(next) => void saved.push(next)}
        />
      </Rtl>
    ));
    await settle();
    expect(display().getAttribute("dir")).toBe("ltr");
    await user.click(display());
    await settle();
    await user.clear(editor());
    await user.keyboard("{Enter}");
    await settle();
    expect(saved).toEqual([]);
    expect(screen.getByRole("alert").textContent).toBe("A name is needed.");
    await user.type(editor(), "تقرير{Enter}");
    await settle();
    expect(saved).toEqual(["تقرير"]);
  });

  test("disabled, it does not open", async () => {
    render(() => <InlineEdit label="Title" value="Locked" onSave={() => undefined} isDisabled />);
    await settle();
    await user.click(display());
    await settle();
    expect(editor()).toBeNull();
  });
});

const PEOPLE: InlineOption[] = [
  { value: "salama", label: "Salama" },
  { value: "ada", label: "Ada" },
];

function trigger(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="inline-select-trigger"]') as HTMLElement;
}

describe("InlineSelect", () => {
  test("reads as its value, named by its label, and saves on change", async () => {
    const [owner, setOwner] = createSignal<string | null>("salama");
    render(() => (
      <InlineSelect
        label="Assignee"
        value={owner()}
        options={PEOPLE}
        noneLabel="Nobody"
        onSave={setOwner}
      />
    ));
    await settle();
    expect(trigger().textContent).toContain("Salama");
    expect(accessibleName(trigger())).toContain("Assignee");
    await user.click(trigger());
    await settle();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Nobody",
      "Salama",
      "Ada",
    ]);
    await user.click(screen.getByRole("option", { name: "Ada" }));
    await settle();
    expect(owner()).toBe("ada");
    await user.click(trigger());
    await settle();
    await user.click(screen.getByRole("option", { name: "Nobody" }));
    await settle();
    expect(owner()).toBeNull();
    expect(trigger().textContent).toContain("Nobody");
  });

  test("keeps a value that left the options, and puts the value back when a save fails", async () => {
    render(() => (
      <InlineSelect
        label="Assignee"
        value="gone"
        options={PEOPLE}
        unknownLabel={() => "Someone"}
        onSave={() => Promise.reject(new Error("Not allowed."))}
      />
    ));
    await settle();
    expect(trigger().textContent).toContain("Someone");
    await user.click(trigger());
    await settle();
    await user.click(screen.getByRole("option", { name: "Ada" }));
    await settle();
    await settle();
    expect(trigger().textContent).toContain("Someone");
    expect(screen.getByRole("alert").textContent).toBe("Not allowed.");
  });
});

describe("inline editing on the server", () => {
  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { InlineEdit, InlineSelect } from "<arc>";
      const PEOPLE = [{ value: "a", label: "Salama" }, { value: "b", label: "Ada" }];
      export function Page() {
        return (
          <div>
            <InlineEdit label="Title" value="Launch plan" onSave={() => undefined} />
            <InlineEdit label="Notes" value="" onSave={() => undefined} multiline />
            <InlineSelect label="Assignee" value="a" options={PEOPLE} onSave={() => undefined} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("Launch plan");
    expect(result.container.textContent).toContain("Not set");
    result.unmount();
  });
});
