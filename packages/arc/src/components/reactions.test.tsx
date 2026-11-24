import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type Reaction, ReactionBar } from "./reactions.tsx";

const REACTIONS: Reaction[] = [
  { emoji: "👍", count: 3, reacted: true, label: "Salama and 2 others" },
  { emoji: "🎉", count: 1 },
];

describe("ReactionBar", () => {
  test("a pressed chip per emoji, the reader's own pressed, toggling it takes it back", async () => {
    const calls: string[] = [];
    render(() => (
      <ReactionBar
        reactions={REACTIONS}
        onReact={(emoji, add) => calls.push(`${emoji}:${String(add)}`)}
      />
    ));
    const group = screen.getByRole("group", { name: "Reactions" });
    const chips = [...group.querySelectorAll("button[aria-pressed]")];
    expect(chips.map((one) => one.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    await user.click(chips[0] as HTMLElement);
    user.tap(chips[1] as HTMLElement);
    expect(calls).toEqual(["👍:false", "🎉:true"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the add menu offers the quick reactions", async () => {
    const calls: string[] = [];
    render(() => (
      <ReactionBar
        reactions={REACTIONS}
        quick={["👍", "🔥"]}
        onReact={(emoji, add) => calls.push(`${emoji}:${String(add)}`)}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Add a reaction" }));
    await settle();
    expect(screen.getAllByRole("menuitem").map((one) => one.textContent)).toEqual(["👍", "🔥"]);
    await user.click(screen.getByRole("menuitem", { name: "🔥" }));
    expect(calls).toEqual(["🔥:true"]);
  });

  test("a picker of the caller's replaces the menu and is handed what adds", () => {
    let pick: ((emoji: string) => void) | undefined;
    const calls: string[] = [];
    render(() => (
      <ReactionBar
        reactions={[]}
        onReact={(emoji) => calls.push(emoji)}
        picker={(add) => {
          pick = add;
          return <button type="button">Pick</button>;
        }}
      />
    ));
    expect(screen.getByRole("button", { name: "Pick" })).toBeDefined();
    pick?.("🚀");
    expect(calls).toEqual(["🚀"]);
    render(() => (
      <ReactionBar
        reactions={REACTIONS}
        onReact={(emoji) => calls.push(emoji)}
        picker={(add) => {
          pick = add;
          return null;
        }}
      />
    ));
    // Adding an emoji the reader already reacted with does nothing.
    pick?.("👍");
    expect(calls).toEqual(["🚀"]);
  });

  test("read-only without onReact, right to left, and a class per part", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ReactionBar reactions={REACTIONS} class="mine" classes={{ root: "r", chip: "c" }} />
      </Arabic>
    ));
    const root = document.querySelector('[data-slot="reaction-bar"]') as HTMLElement;
    expect(root.classList.contains("r") && root.classList.contains("mine")).toBe(true);
    expect(root.querySelectorAll(".c")).toHaveLength(2);
    expect(screen.queryAllByRole("button", { name: "Add a reaction" })).toHaveLength(0);
    expect([...root.querySelectorAll("button")].every((one) => one.hasAttribute("disabled"))).toBe(
      true,
    );
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { ReactionBar } from "<arc>";
      export function Page() {
        return <ReactionBar reactions={[{ emoji: "👍", count: 2, reacted: true }]} onReact={() => {}} />;
      }
    `);
    expect(result.container.textContent).toContain("👍 2");
    result.unmount();
  });
});
