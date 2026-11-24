import { afterEach, describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, fireEvent, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { TagInput } from "./tag-input.tsx";

afterEach(() => destroyAnnouncer());

function field(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox");
}

function tags(): string[] {
  return screen.queryAllByRole("row").map((row) => row.textContent ?? "");
}

function Hosts(props: { initial?: string[]; maxTags?: number; onChange?: (v: string[]) => void }) {
  const [hosts, setHosts] = createSignal<readonly string[]>(props.initial ?? []);
  return (
    <TagInput
      label="Hosts"
      description="Comma or Enter between them."
      value={hosts()}
      maxTags={props.maxTags}
      onChange={(next) => {
        setHosts(next);
        props.onChange?.([...next]);
      }}
      validate={(host) => (host.includes(".") ? undefined : `${host} is not a host name`)}
    />
  );
}

describe("TagInput", () => {
  test("a word and Enter or a comma becomes a tag; the label names the input", async () => {
    render(() => <Hosts />);
    await settle();
    expect(field().labels?.[0]?.textContent).toBe("Hosts");
    await user.type(field(), "example.com{Enter}");
    await settle();
    expect(tags()).toEqual(["example.com"]);
    expect(field().value).toBe("");
    await user.type(field(), "api.example.com,");
    await settle();
    expect(tags()).toEqual(["example.com", "api.example.com"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a pasted list becomes a tag per entry, and what fails stays with the reason", async () => {
    render(() => <Hosts />);
    await settle();
    fireEvent.paste(field(), {
      clipboardData: { getData: () => "a.example.com\nlocalhost; b.example.com" },
    });
    await settle();
    expect(tags()).toEqual(["a.example.com", "b.example.com"]);
    expect(field().value).toBe("localhost");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("localhost is not a host name")).toBeDefined();
  });

  test("refuses a repeat and more than maxTags, and says why", async () => {
    render(() => <Hosts initial={["a.example.com"]} maxTags={2} />);
    await settle();
    await user.type(field(), "A.example.com{Enter}");
    await settle();
    expect(screen.getByText("A.example.com is already added")).toBeDefined();
    expect(tags()).toEqual(["a.example.com"]);
    await user.clear(field());
    await user.type(field(), "b.example.com{Enter}c.example.com{Enter}");
    await settle();
    expect(tags()).toEqual(["a.example.com", "b.example.com"]);
    expect(screen.getByText("No more than 2")).toBeDefined();
  });

  test("Backspace in the empty input moves to the last tag, and a second removes it", async () => {
    render(() => <Hosts initial={["a.example.com", "b.example.com"]} />);
    await settle();
    field().focus();
    await user.keyboard("{Backspace}");
    expect(document.activeElement?.textContent).toBe("b.example.com");
    await user.keyboard("{Backspace}");
    await settle();
    expect(tags()).toEqual(["a.example.com"]);
  });

  test("a tag's remove button takes it out, and has room for a finger", async () => {
    const changes: string[][] = [];
    render(() => <Hosts initial={["a.example.com"]} onChange={(next) => changes.push(next)} />);
    await settle();
    const remove = screen.getByRole("button", { name: "Remove a.example.com" });
    expect(wears(remove, target.size)).toBe(true);
    expect(wears(document.querySelector('[data-slot="tag-input-control"]'), target.size)).toBe(
      true,
    );
    user.tap(remove);
    await settle();
    expect(changes).toEqual([[]]);
    expect(document.activeElement).toBe(field());
  });

  test("in a right-to-left page the arrows still walk the tags in reading order", async () => {
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <Hosts initial={["a.example.com", "b.example.com"]} />
      </Rtl>
    ));
    await settle();
    field().focus();
    await user.keyboard("{Backspace}");
    expect(document.activeElement?.textContent).toBe("b.example.com");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("a.example.com");
  });

  test("holds the form's value inside form.AppField, and submits a hidden input per tag", async () => {
    let values: Record<string, unknown> = {};
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { topics: ["design"] } }));
      values = form.state.values;
      return (
        <form.AppForm>
          <form>
            <form.AppField name="topics">{(f) => <f.TagInput label="Topics" />}</form.AppField>
          </form>
        </form.AppForm>
      );
    });
    await settle();
    expect(tags()).toEqual(["design"]);
    await user.type(field(), "research{Enter}");
    await settle();
    const form = document.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).getAll("topics")).toEqual(["design", "research"]);
    void values;
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <TagInput
        label="Topics"
        defaultValue={["design"]}
        class="mine"
        classes={{ control: "c", input: "i", tag: "t", remove: "x", label: "l" }}
      />
    ));
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("tag-input")?.classList.contains("mine")).toBe(true);
    expect(by("tag-input-control")?.classList.contains("c")).toBe(true);
    expect(by("tag-input-field")?.classList.contains("i")).toBe(true);
    expect(by("tag")?.classList.contains("t")).toBe(true);
    expect(by("tag-remove")?.classList.contains("x")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { TagInput } from "<arc>";
      export function Page() {
        return <TagInput label="Topics" defaultValue={["design", "research"]} name="topics" />;
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(result.container.querySelectorAll('input[type="hidden"]')).toHaveLength(2);
    result.unmount();
  });
});
