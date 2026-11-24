import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { TypingIndicator } from "./typing-indicator.tsx";

const text = (): string =>
  document.querySelector('[data-slot="typing-indicator"]')?.textContent ?? "";

describe("TypingIndicator", () => {
  test("names who is typing, then counts the rest, in a status that stays in the page", async () => {
    const [people, setPeople] = createSignal<{ name: string }[]>([]);
    render(() => <TypingIndicator people={people()} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    setPeople([{ name: "Alex" }]);
    flush();
    expect(text()).toBe("Alex is typing");
    setPeople([{ name: "Alex" }, { name: "Sam" }]);
    flush();
    expect(text()).toBe("Alex and Sam are typing");
    setPeople([{ name: "Alex" }, { name: "Sam" }, { name: "Rin" }, { name: "Lee" }]);
    flush();
    expect(text()).toBe("Alex, Sam, and 2 others are typing");
    expect(screen.getByRole("status")).toBe(status);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("joins the names as the locale does, right to left, and takes a class per part", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <TypingIndicator
          people={[{ name: "سلمى" }, { name: "علي" }]}
          max={3}
          class="mine"
          classes={{ root: "r", dots: "d", text: "t" }}
        />
      </Arabic>
    ));
    expect(text()).toContain("سلمى و");
    const root = document.querySelector('[data-slot="typing-indicator"]');
    expect(root?.classList.contains("r") && root.classList.contains("mine")).toBe(true);
    expect(
      document.querySelector('[data-slot="typing-indicator-dots"]')?.classList.contains("d"),
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="typing-indicator-text"]')?.classList.contains("t"),
    ).toBe(true);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { TypingIndicator } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return <TypingIndicator people={[{ name: "Alex" }]} />;
      }
    `);
    expect(result.container.textContent).toBe("Alex is typing");
    result.unmount();
  });
});
