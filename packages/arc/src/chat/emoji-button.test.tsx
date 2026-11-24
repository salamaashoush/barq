import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { EmojiButton } from "./emoji-button.tsx";
import { sampleSource, scrollViewport, sizeViewport } from "./test-chat.ts";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function count(name: string): number {
  return document.querySelectorAll(`[data-slot="${name}"]`).length;
}

describe("EmojiButton", () => {
  test("opens the picker, hands over the emoji chosen and closes", async () => {
    const chosen: string[] = [];
    render(() => <EmojiButton source={sampleSource()} onSelect={(emoji) => chosen.push(emoji)} />);
    const button = screen.getByRole("button", { name: "Choose an emoji" });
    expect(button.dataset.slot).toBe("emoji-button");
    await user.click(button);
    await waitFor(() => expect(count("emoji-picker-viewport")).toBe(1));
    const viewport = slot("emoji-picker-viewport");
    sizeViewport(viewport, { height: 360 });
    scrollViewport(viewport, 0);
    await settle();
    await user.click(screen.getByRole("option", { name: "pizza" }));
    await settle();
    expect(chosen).toEqual(["🍕"]);
    expect(count("emoji-picker")).toBe(0);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("its label, icon and open state are the caller's, with a class per part", async () => {
    const changes: boolean[] = [];
    render(() => (
      <EmojiButton
        label="Add a reaction"
        source={sampleSource()}
        open
        onOpenChange={(next) => changes.push(next)}
        onSelect={() => {}}
        class="mine"
        classes={{ picker: "pick" }}
      >
        <span data-testid="icon">+</span>
      </EmojiButton>
    ));
    await settle();
    const button = screen.getByRole("button", { name: "Add a reaction" });
    expect(button.classList.contains("mine")).toBe(true);
    expect(screen.getByTestId("icon").textContent).toBe("+");
    await waitFor(() => expect(count("emoji-picker")).toBe(1));
    expect(slot("emoji-picker").classList.contains("pick")).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    expect(changes).toEqual([false]);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { EmojiButton } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return <EmojiButton onSelect={() => {}} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="emoji-button"]')).not.toBeNull();
    result.unmount();
  });
});
