import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { SplitButton } from "./split-button.tsx";

describe("SplitButton", () => {
  test("a default action and a menu of the rest, each a stop of its own", async () => {
    const ran: string[] = [];
    render(() => (
      <SplitButton
        onPress={() => ran.push("send")}
        actions={[
          { id: "later", label: "Send later", onAction: () => ran.push("later") },
          { id: "discard", label: "Discard", tone: "danger", onAction: () => ran.push("discard") },
        ]}
      >
        Send
      </SplitButton>
    ));
    await user.click(screen.getByRole("button", { name: "Send" }));
    const more = screen.getByRole("button", { name: "More options" });
    expect(more.getAttribute("aria-haspopup")).toBe("true");
    more.focus();
    await user.keyboard("{Enter}");
    await settle();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Send later", "Discard"]);
    expect(items[1]?.getAttribute("data-variant")).toBe("destructive");
    await user.keyboard("{ArrowDown}{Enter}");
    await settle();
    expect(ran).toEqual(["send", "discard"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a tap on the arrow opens the menu; its parts take classes and slots", async () => {
    render(() => (
      <SplitButton
        onPress={() => {}}
        actions={[{ id: "a", label: "A", onAction: () => {} }]}
        class="mine"
        classes={{ action: "x", trigger: "t", menu: "m", item: "i" }}
      >
        Go
      </SplitButton>
    ));
    function by(slot: string): Element | null {
      return document.querySelector(`[data-slot="${slot}"]`);
    }
    expect(by("split-button")?.classList.contains("mine")).toBe(true);
    expect(by("split-button-action")?.classList.contains("x")).toBe(true);
    user.tap(by("split-button-trigger") as HTMLElement);
    await settle();
    expect(by("split-button-trigger")?.classList.contains("t")).toBe(true);
    expect(by("split-button-menu")?.classList.contains("m")).toBe(true);
    expect(by("split-button-item")?.classList.contains("i")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { SplitButton } from "<arc>";
      export function Page() {
        return <SplitButton onPress={() => {}} actions={[{ id: "a", label: "A", onAction: () => {} }]}>Go</SplitButton>;
      }
    `);
    expect(result.container.textContent).toContain("Go");
    result.unmount();
  });
});
