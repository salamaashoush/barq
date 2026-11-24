import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { cleanup, render, screen, user } from "@barqjs/testing";

import { MessageItem } from "../chat/message-item.tsx";
import type { ChatMessage } from "../chat/model.ts";
import type { ComposedMessage } from "./chat-composer.tsx";
import { MessageEditor } from "./message-editor.tsx";
import { keydown, settle } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const ME = { id: "me", name: "Salama Ashoush" };

const sent = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  author: ME,
  createdAt: new Date("2026-05-10T09:00:00Z"),
  body: "First line\nsecond line",
  ...over,
});

function Thread(props: { message: ChatMessage; saved: ComposedMessage[] }) {
  const [editing, setEditing] = createSignal<string | undefined>(undefined);
  return (
    <MessageItem
      message={props.message}
      currentUserId="me"
      timeZone="UTC"
      tabIndex={0}
      onEdit={(message) => setEditing(message.id)}
      editingId={editing()}
      renderEditor={(message) => (
        <MessageEditor
          message={message}
          onSave={(_, edited) => {
            props.saved.push(edited);
            setEditing(undefined);
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}
    />
  );
}

describe("MessageEditor in MessageItem", () => {
  test("Edit opens the composer on the message's text, Enter saves and the body comes back", async () => {
    const saved: ComposedMessage[] = [];
    render(() => <Thread message={sent()} saved={saved} />);
    await user.click(screen.getByRole("button", { name: "Edit message" }));
    await settle();
    const box = screen.getByRole("textbox", { name: "Editing message" });
    expect(box.textContent).toBe("First linesecond line");
    expect(document.querySelector('[data-slot="message-item-body"]')).toBeNull();
    expect(document.querySelector('[data-slot="message-item-actions"]')).toBeNull();
    expect(document.querySelector('[data-slot="message-item"]')?.hasAttribute("data-editing")).toBe(
      true,
    );
    keydown(box, "Enter");
    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.text).toBe("First line\nsecond line");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('[data-slot="message-item-body"]')?.textContent).toBe(
      "First line\nsecond line",
    );
    expect(document.activeElement?.getAttribute("data-slot")).toBe("message-item");
  });

  test("Escape leaves the edit with nothing saved, and focus back on the message", async () => {
    const saved: ComposedMessage[] = [];
    render(() => (
      <Thread
        message={sent({
          content: {
            root: {
              type: "root",
              version: 1,
              direction: null,
              format: "",
              indent: 0,
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  direction: null,
                  format: "",
                  indent: 0,
                  textFormat: 0,
                  textStyle: "",
                  children: [
                    {
                      type: "text",
                      version: 1,
                      text: "Rich",
                      format: 1,
                      style: "",
                      mode: "normal",
                      detail: 0,
                    },
                  ],
                },
              ],
            },
          } as never,
        })}
        saved={saved}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Edit message" }));
    await settle();
    const box = screen.getByRole("textbox", { name: "Editing message" });
    expect(box.querySelector("strong")?.textContent).toBe("Rich");
    keydown(box, "Escape");
    await settle();
    expect(saved).toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("message-item");
  });
});
