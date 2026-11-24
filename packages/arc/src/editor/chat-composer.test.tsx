import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { icon } from "@barqjs/ui/shared-icon";
import { ariaViolations, cleanup, fireEvent, render, screen, user, waitFor } from "@barqjs/testing";
import { $getRoot, $getSelection, $isRangeSelection } from "lexical";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates, wears } from "../test-arc.ts";
import { type ComposedMessage, ChatComposer } from "./chat-composer.tsx";
import { capture, keydown, settle, textOf, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

function box(): HTMLElement {
  return screen.getByRole("textbox", { name: "Message" });
}

function sendButton(): HTMLElement {
  return screen.getByRole("button", { name: "Send message" });
}

describe("ChatComposer", () => {
  test("Enter sends the message as JSON, markdown and text, and empties the composer", async () => {
    const editor = capture();
    const sent: ComposedMessage[] = [];
    render(() => (
      <ChatComposer onEditor={editor.set} onSend={(message) => void sent.push(message)} />
    ));
    await settle();
    expect(sendButton().hasAttribute("disabled")).toBe(true);
    await typeText(editor.get(), "hello **there**");
    expect(sendButton().hasAttribute("disabled")).toBe(false);
    keydown(box(), "Enter");
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe("hello there");
    expect(sent[0]?.markdown).toBe("hello **there**");
    expect(sent[0]?.value.root.children).toHaveLength(1);
    expect(textOf(editor.get())).toBe("");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Shift+Enter breaks the line, and Enter inside a list makes the next item", async () => {
    const editor = capture();
    const sent: ComposedMessage[] = [];
    render(() => (
      <ChatComposer onEditor={editor.set} onSend={(message) => void sent.push(message)} />
    ));
    await settle();
    await typeText(editor.get(), "one");
    keydown(box(), "Enter", { shiftKey: true });
    await settle();
    await typeText(editor.get(), "two");
    expect(sent).toHaveLength(0);
    expect(textOf(editor.get())).toBe("one\ntwo");
    editor.get().update(() => $getRoot().clear());
    await settle();
    await typeText(editor.get(), "- item");
    keydown(box(), "Enter");
    await settle();
    expect(sent).toHaveLength(0);
    expect(box().querySelectorAll("li")).toHaveLength(2);
  });

  test("Enter with the mention list open chooses a person rather than sending", async () => {
    const editor = capture();
    const sent: ComposedMessage[] = [];
    render(() => (
      <ChatComposer
        onEditor={editor.set}
        mentions={[{ id: "u1", name: "Salama" }]}
        onSend={(message) => void sent.push(message)}
      />
    ));
    await settle();
    box().focus();
    await typeText(editor.get(), "hi @sal");
    keydown(box(), "Enter");
    await settle();
    expect(sent).toHaveLength(0);
    expect(textOf(editor.get())).toBe("hi @Salama ");
    keydown(box(), "Enter");
    await settle();
    expect(sent[0]?.markdown).toBe("hi [@Salama](mention:u1) ");
  });

  test("a send that fails keeps what was written", async () => {
    const editor = capture();
    render(() => (
      <ChatComposer onEditor={editor.set} onSend={() => Promise.reject(new Error("offline"))} />
    ));
    await settle();
    await typeText(editor.get(), "keep me");
    keydown(box(), "Enter");
    await settle(5);
    expect(textOf(editor.get())).toBe("keep me");
  });

  test("edits a message: Enter saves, Escape cancels, and the composer says it is editing", async () => {
    const editor = capture();
    const saved: string[] = [];
    let cancelled = 0;
    render(() => (
      <ChatComposer
        mode="edit"
        defaultMarkdown="old text"
        onEditor={editor.set}
        onCancel={() => cancelled++}
        onSend={(message) => void saved.push(message.markdown)}
      />
    ));
    await settle();
    expect(screen.getByText("Editing message")).toBeDefined();
    editor.get().update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(" fixed");
      else $getRoot().selectEnd().insertText(" fixed");
    });
    await settle();
    keydown(box(), "Enter");
    await settle();
    expect(saved).toEqual(["old text fixed"]);
    expect(textOf(editor.get())).toBe("old text fixed");
    keydown(box(), "Escape");
    await settle();
    expect(cancelled).toBe(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelled).toBe(2);
  });

  test("attachments go up through the queue, hold the send while they do, and go with the message", async () => {
    const editor = capture();
    const sent: ComposedMessage[] = [];
    let finish: () => void = () => {};
    render(() => (
      <ChatComposer
        onEditor={editor.set}
        upload={(file: File) =>
          new Promise((resolve) => {
            finish = () => resolve(`https://files.example.com/${file.name}`);
          })
        }
        onSend={(message) => void sent.push(message)}
      />
    ));
    await settle();
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDefined();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["x"], "notes.pdf", { type: "application/pdf" })],
    });
    fireEvent.change(input);
    await settle();
    expect(
      document.querySelector('[data-slot="chat-composer-attachments"]')?.textContent,
    ).toContain("notes.pdf");
    await typeText(editor.get(), "see attached");
    expect(sendButton().hasAttribute("disabled")).toBe(true);
    finish();
    await waitFor(() => expect(sendButton().hasAttribute("disabled")).toBe(false));
    keydown(box(), "Enter");
    await settle();
    expect(sent[0]?.attachments.map((one) => one.result)).toEqual([
      "https://files.example.com/notes.pdf",
    ]);
    expect(document.querySelector('[data-slot="chat-composer-attachments"]')).toBeNull();
  });

  test("past its limit it says so and will not send", async () => {
    const editor = capture();
    render(() => <ChatComposer onEditor={editor.set} maxLength={5} onSend={() => undefined} />);
    await settle();
    await typeText(editor.get(), "toolong");
    expect(document.querySelector('[data-slot="chat-composer-counter"]')?.textContent).toBe(
      "2 characters too many",
    );
    expect(sendButton().hasAttribute("disabled")).toBe(true);
    expect(box().getAttribute("aria-invalid")).toBe("true");
  });

  test("a schedule-send action rides beside Send in a split button", async () => {
    const editor = capture();
    let scheduled = 0;
    render(() => (
      <ChatComposer
        onEditor={editor.set}
        onSend={() => undefined}
        sendActions={[{ id: "later", label: "Schedule send", onAction: () => scheduled++ }]}
      />
    ));
    await settle();
    await typeText(editor.get(), "later");
    await user.click(screen.getByRole("button", { name: "More options" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Schedule send" }));
    expect(scheduled).toBe(1);
  });

  test("the formatting toolbar opens on request, and the send arrow turns in RTL", async () => {
    function Arabic(props: { children: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ChatComposer label="رسالة" onSend={() => undefined} />
      </Arabic>
    ));
    await settle();
    expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Formatting" }));
    await settle();
    expect(screen.getByRole("button", { name: "Bold" })).toBeDefined();
    expect(
      wears(
        document.querySelector('[data-slot="icon-button"] svg.' + icon.directional.split(" ")[0]),
        icon.directional,
      ),
    ).toBe(true);
  });

  test("takes a class per part", async () => {
    render(() => (
      <ChatComposer
        onSend={() => undefined}
        class="mine"
        classes={{ body: "b", content: "c", footer: "f", tools: "t" }}
      />
    ));
    await settle();
    expect(document.querySelector('[data-slot="chat-composer"]')?.classList.contains("mine")).toBe(
      true,
    );
    expect(
      document.querySelector('[data-slot="chat-composer-body"]')?.classList.contains("b"),
    ).toBe(true);
    expect(box().classList.contains("c")).toBe(true);
    expect(
      document.querySelector('[data-slot="chat-composer-footer"]')?.classList.contains("f"),
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="chat-composer-tools"]')?.classList.contains("t"),
    ).toBe(true);
  });

  test("editing a message, a server writes its text in the box", async () => {
    const { code, html, errors } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { ChatComposer } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => (
          <ChatComposer mode="edit" defaultMarkdown="Sent **earlier**" placeholder="Write" onSend={() => {}} />
        ));
      }
    `);
    expect(errors).toBe("");
    expect(code).toBe(0);
    const written = html
      .slice(html.indexOf('data-slot="chat-composer-content"'))
      .replaceAll(/<!--[^>]*-->/gu, "");
    expect(written).toContain("Sent <strong>earlier</strong>");
    expect(html).not.toContain(">Write</span>");
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ChatComposer } from ${entry};
      export function Page() {
        return <ChatComposer placeholder="Message #general" onSend={() => undefined} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="chat-composer-content"]')).not.toBeNull();
    result.unmount();
  });
});
