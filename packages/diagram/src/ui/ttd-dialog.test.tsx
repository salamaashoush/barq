/**
 * The text-to-diagram dialog: Mermaid typed, previewed and inserted, and the
 * chat with an app's backend, streamed, repaired and kept, offered only
 * when the app gives one.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { ariaViolations, screen, within } from "@barqjs/testing";

import { mountEditor, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";
import type { SavedChat, TextSubmitRequest, TextSubmitResult } from "../ttd/types.ts";

setupUITests();

beforeEach(() => localStorage.clear());

const FLOW = "flowchart LR\n  A[Start] --> B[Ship]";

/** Waits out the dialog's typing delay and the conversion after it. */
const waitFor = async (check: () => boolean, rounds = 60) => {
  for (let round = 0; round < rounds && !check(); round++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await settle();
  }
};

const type = (element: HTMLElement, value: string) => {
  (element as HTMLTextAreaElement).value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

const openTTD = async (api: DiagramEditorApi, tab: "mermaid" | "text-to-diagram") => {
  api.updateScene({ appState: { openDialog: { name: "ttd", tab } } });
  await settle();
};

describe("Mermaid", () => {
  test("the toolbar's entry opens it; a definition previews and inserts as elements", async () => {
    const { api } = await mountEditor();
    screen.getByTestId("toolbar-extra-tools").click();
    await settle();
    screen.getByTestId("toolbar-mermaid").click();
    await settle();
    expect(api.getAppState().openDialog).toEqual({ name: "ttd", tab: "mermaid" });
    const dialog = screen.getByRole("dialog", { name: "Mermaid to Excalidraw" });
    // no backend: no chat, no tabs
    expect(within(dialog).queryByRole("tablist")).toBeNull();
    type(within(dialog).getByTestId("mermaid-input"), FLOW);
    const preview = within(dialog).getByTestId("mermaid-preview");
    await waitFor(() => preview.querySelector("canvas") !== null);
    expect(preview.querySelector("canvas")).not.toBeNull();
    expect(ariaViolations(dialog)).toEqual([]);
    within(dialog).getByTestId("mermaid-insert").click();
    await settle();
    expect(api.getAppState().openDialog).toBeNull();
    const texts = api
      .getSceneElements()
      .flatMap((element) => (element.type === "text" ? [element.text] : []));
    expect(texts).toContain("Start");
    expect(texts).toContain("Ship");
    expect(api.getSceneElements().some((element) => element.type === "arrow")).toBe(true);
    expect(JSON.parse(localStorage.getItem("mermaid-to-excalidraw")!)).toBe(FLOW);
  });

  test("a definition that does not parse says so, and nothing inserts", async () => {
    const { api } = await mountEditor();
    await openTTD(api, "mermaid");
    const dialog = screen.getByRole("dialog");
    type(within(dialog).getByTestId("mermaid-input"), "flowchart LR\n  A[[[ -->");
    await waitFor(() => within(dialog).queryByTestId("mermaid-error") !== null);
    expect(within(dialog).getByTestId("mermaid-error").textContent).not.toBe("");
    within(dialog).getByTestId("mermaid-insert").click();
    await settle();
    expect(api.getSceneElements()).toHaveLength(0);
  });

  test("without a backend the text-to-diagram entries are not offered", async () => {
    const { api } = await mountEditor();
    screen.getByTestId("toolbar-extra-tools").click();
    await settle();
    expect(screen.queryByTestId("toolbar-textToDiagram")).toBeNull();
    await openTTD(api, "text-to-diagram");
    expect(screen.getByRole("dialog", { name: "Mermaid to Excalidraw" })).toBeDefined();
  });
});

/** A backend streaming `reply` in three pieces, recording what it was asked. */
const streamingBackend = (replies: string[]) => {
  const requests: TextSubmitRequest[] = [];
  const onTextSubmit = async (request: TextSubmitRequest): Promise<TextSubmitResult> => {
    requests.push(request);
    const reply = replies.shift() ?? "";
    request.onStreamCreated?.();
    const third = Math.ceil(reply.length / 3);
    for (let at = 0; at < reply.length; at += third) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      request.onChunk?.(reply.slice(at, at + third));
    }
    return { generatedResponse: reply, error: null, rateLimit: 10, rateLimitRemaining: 9 };
  };
  return { onTextSubmit, requests };
};

describe("text to diagram", () => {
  test("a prompt streams a reply that previews and inserts, and the chat is kept", async () => {
    const backend = streamingBackend([FLOW]);
    let kept: SavedChat[] = [];
    const { api } = await mountEditor({
      textToDiagram: {
        onTextSubmit: backend.onTextSubmit,
        persistenceAdapter: {
          loadChats: async () => [],
          saveChats: async (chats) => {
            kept = chats;
          },
        },
      },
    });
    await openTTD(api, "text-to-diagram");
    const dialog = screen.getByRole("dialog", { name: "Text to diagram" });
    expect(within(dialog).getByRole("tab", { name: /Mermaid/ })).toBeDefined();
    const input = within(dialog).getByTestId("ttd-input");
    type(input, "a two step release");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => within(dialog).queryByTestId("ttd-insert-message") !== null);
    expect(backend.requests[0]?.messages).toEqual([
      { role: "user", content: "a two step release" },
    ]);
    const reply = within(dialog).getByTestId("ttd-message-assistant");
    expect(reply.querySelector("pre")?.textContent).toBe(FLOW);
    expect(within(dialog).getByText("9 requests left today")).toBeDefined();
    const preview = within(dialog).getByTestId("ttd-preview");
    await waitFor(() => preview.querySelector("canvas") !== null);
    expect(kept[0]?.title).toBe("a two step release");
    expect(ariaViolations(dialog)).toEqual([]);
    within(dialog).getByTestId("ttd-insert").click();
    await settle();
    expect(api.getAppState().openDialog).toBeNull();
    expect(api.getSceneElements().some((element) => element.type === "arrow")).toBe(true);
  });

  test("a reply Mermaid cannot read is repaired by the backend", async () => {
    const backend = streamingBackend(["flowchart LR\n  A[[[ -->", FLOW]);
    const { api } = await mountEditor({ textToDiagram: { onTextSubmit: backend.onTextSubmit } });
    await openTTD(api, "text-to-diagram");
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByTestId("ttd-input");
    type(input, "anything at all");
    within(dialog).getByTestId("ttd-send").click();
    await waitFor(() => within(dialog).queryByTestId("ttd-repair") !== null);
    within(dialog).getByTestId("ttd-repair").click();
    await waitFor(() => within(dialog).queryByTestId("ttd-insert-message") !== null);
    expect(backend.requests[1]?.messages.at(-1)?.content).toContain(
      "Fix the error in this Mermaid diagram",
    );
    // the repair answered in the same reply
    expect(within(dialog).getAllByTestId("ttd-message-assistant")).toHaveLength(1);
  });

  test("a failed request can be retried, and Stop aborts a generation", async () => {
    let calls = 0;
    const { api } = await mountEditor({
      textToDiagram: {
        onTextSubmit: (request) => {
          calls++;
          if (calls === 1) {
            return Promise.resolve({ error: { message: "Server error", status: 500 } });
          }
          return new Promise<TextSubmitResult>((resolve) =>
            request.signal?.addEventListener("abort", () =>
              resolve({ error: { name: "AbortError", message: "Aborted" } }),
            ),
          );
        },
      },
    });
    await openTTD(api, "text-to-diagram");
    const dialog = screen.getByRole("dialog");
    type(within(dialog).getByTestId("ttd-input"), "a diagram please");
    within(dialog).getByTestId("ttd-send").click();
    await waitFor(() => within(dialog).queryByText("Retry") !== null);
    expect(within(dialog).getAllByText("Server error").length).toBeGreaterThan(0);
    within(dialog).getByText("Retry").click();
    await waitFor(() => within(dialog).queryByTestId("ttd-stop") !== null);
    within(dialog).getByTestId("ttd-stop").click();
    await waitFor(() => within(dialog).queryByTestId("ttd-send") !== null);
    expect(within(dialog).getByTestId("ttd-send")).toBeDefined();
    expect(calls).toBe(2);
  });

  test("aiEnabled false hides the chat even with a backend", async () => {
    const backend = streamingBackend([]);
    const { api } = await mountEditor({
      aiEnabled: false,
      textToDiagram: { onTextSubmit: backend.onTextSubmit },
    });
    await openTTD(api, "text-to-diagram");
    expect(screen.getByRole("dialog", { name: "Mermaid to Excalidraw" })).toBeDefined();
  });
});
