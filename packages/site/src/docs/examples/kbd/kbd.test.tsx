import { describe, expect, test } from "bun:test";

import { render } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import KbdButton from "./kbd-button.tsx";
import KbdDemo from "./kbd-demo.tsx";

describe("the kbd examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("kbd")).toEqual([]);
  });

  test("a group holds its keys, each a kbd element", () => {
    render(() => <KbdDemo />);
    const groups = [...document.querySelectorAll('[data-slot="kbd-group"]')];
    expect(groups).toHaveLength(2);
    expect([...(groups[0]?.querySelectorAll("kbd") ?? [])].map((key) => key.textContent)).toEqual([
      "⌘",
      "⇧",
      "⌥",
      "⌃",
    ]);
  });

  test("the key sits inside the button it belongs to", () => {
    render(() => <KbdButton />);
    expect(document.querySelector('[data-slot="button"] kbd')?.textContent).toBe("⏎");
  });
});
