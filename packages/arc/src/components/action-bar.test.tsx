import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ActionBar, type BarAction, actionBarStyles } from "./action-bar.tsx";
import { layout } from "../style/index.ts";

function Rtl(props: { children?: Child }) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("ActionBar", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    const spy = spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const width = this instanceof HTMLButtonElement ? 100 : 260;
      return {
        width,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    });
    restore = () => spy.mockRestore();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  const ACTIONS: BarAction[] = [
    { id: "copy", label: "Copy", priority: 0 },
    { id: "send", label: "Send", priority: 3 },
    { id: "pdf", label: "PDF", priority: 1 },
    { id: "void", label: "Void", tone: "danger" },
  ];

  test("keeps the highest priorities in view and moves the rest into More", async () => {
    const ran: string[] = [];
    render(() => (
      <ActionBar aria-label="Invoice" actions={ACTIONS} onAction={(id) => ran.push(id)} />
    ));
    flush();
    await settle();
    const bar = screen.getByRole("toolbar", { name: "Invoice" });
    const shown = within(bar).getAllByRole("button");
    expect(shown.map((one) => one.textContent || one.getAttribute("aria-label"))).toEqual([
      "Send",
      "More actions",
    ]);
    await user.click(shown[0] as HTMLElement);
    await user.click(shown[1] as HTMLElement);
    await settle();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Copy", "PDF", "Void"]);
    await user.click(items[1] as HTMLElement);
    expect(ran).toEqual(["send", "pdf"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows move along it in the reading direction", async () => {
    restore?.();
    restore = null;
    render(() => (
      <Rtl>
        <ActionBar aria-label="فاتورة" actions={ACTIONS} onAction={() => {}} overflow="wrap" />
      </Rtl>
    ));
    await settle();
    const buttons = within(screen.getByRole("toolbar")).getAllByRole("button");
    (buttons[0] as HTMLElement).focus();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(buttons[1] as HTMLElement);
  });

  test("overflow=wrap lets the row wrap, and collapse keeps it on one line", async () => {
    render(() => (
      <>
        <ActionBar aria-label="Wrapping" actions={ACTIONS} onAction={() => {}} overflow="wrap" />
        <ActionBar aria-label="Collapsing" actions={ACTIONS} onAction={() => {}} />
      </>
    ));
    await settle();
    const [wrapping, collapsing] = [...document.querySelectorAll('[data-slot="action-bar-group"]')];
    expect(wears(wrapping, layout.wrap)).toBe(true);
    expect(wears(collapsing, layout.wrap)).toBe(false);
    expect(wears(collapsing, actionBarStyles({ overflow: "collapse" }).group)).toBe(true);
  });

  test("its parts take classes and slots", async () => {
    render(() => (
      <ActionBar
        aria-label="Invoice"
        actions={ACTIONS}
        onAction={() => {}}
        class="mine"
        classes={{ group: "g", action: "a", more: "m" }}
      />
    ));
    flush();
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("action-bar")?.classList.contains("mine")).toBe(true);
    expect(by("action-bar-group")?.classList.contains("g")).toBe(true);
    expect(by("action-bar-action")?.classList.contains("a")).toBe(true);
    expect(by("action-group-more")?.classList.contains("m")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ActionBar } from "<arc>";
      export function Page() {
        return <ActionBar aria-label="Bar" actions={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} onAction={() => {}} />;
      }
    `);
    expect(result.container.querySelector('[role="toolbar"]')).not.toBeNull();
    result.unmount();
  });

  test("hydrates a label shown and a label withheld for an icon-only action", async () => {
    const result = await hydrates(`
      import { ActionBar } from "<arc>";
      export function Page() {
        return (
          <ActionBar
            aria-label="Bar"
            overflow="wrap"
            actions={[{ id: "a", label: "Copy" }, { id: "b", label: "Send", iconOnly: true }]}
            onAction={() => {}}
          />
        );
      }
    `);
    const actions = [...result.container.querySelectorAll('[data-slot="action-bar-action"]')];
    expect(actions.map((one) => one.textContent)).toEqual(["Copy", ""]);
    expect(actions[1]?.getAttribute("aria-label")).toBe("Send");
    result.unmount();
  });

  test("hydrates the icons written in its actions", async () => {
    const result = await hydrates(`
      import { ActionBar } from "<arc>";
      import { Download } from "@barqjs/lucide/icons/download";
      function Glyph() {
        return <svg data-glyph="send" viewBox="0 0 1 1"><path d="M0 0" /></svg>;
      }
      export function Page() {
        return (
          <ActionBar
            aria-label="Invoice"
            overflow="wrap"
            actions={[
              { id: "pdf", label: "Download PDF", icon: <Download /> },
              { id: "send", label: "Send", icon: <Glyph />, iconOnly: true },
              { id: "void", label: "Void" },
            ]}
            onAction={() => {}}
          />
        );
      }
    `);
    const icons = [...result.container.querySelectorAll('[data-slot="action-bar-icon"]')];
    expect(icons).toHaveLength(2);
    expect(icons[0]?.querySelector("svg")).not.toBeNull();
    expect(icons[1]?.querySelector('[data-glyph="send"]')).not.toBeNull();
    result.unmount();
  });

  test("hydrates icons from actions declared apart from it, inside a <Show>", async () => {
    const result = await hydrates(`
      import { Show } from "@barqjs/core";
      import { ActionBar } from "<arc>";
      const actions = [
        { id: "copy", label: "Copy", icon: <svg data-glyph="copy" viewBox="0 0 1 1" /> },
        { id: "send", label: "Send" },
      ];
      export function Page() {
        return (
          <Show when={actions.length > 0}>
            <ActionBar aria-label="Record" actions={actions} onAction={() => {}} />
          </Show>
        );
      }
    `);
    expect(result.container.querySelector('[data-glyph="copy"]')).not.toBeNull();
    result.unmount();
  });
});
