import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { Tile, tileStyles } from "./tile.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("Tile", () => {
  test("an article named by its title, with media on top", async () => {
    render(() => (
      <Tile
        title="Northwind"
        eyebrow="Project"
        description="12 checks"
        media={<img src="/cover.png" alt="" />}
        footer={<span>Updated today</span>}
      />
    ));
    const article = screen.getByRole("article", { name: "Northwind" });
    expect(article.querySelector('[data-slot="tile-media"] img')).not.toBeNull();
    expect(wears(article, tileStyles({ mediaPosition: "top" }).root)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with href the title is a link over the whole tile, and actions stay their own", async () => {
    let acted = 0;
    render(() => (
      <Tile
        title="Northwind"
        href="/projects/northwind"
        actions={
          <button type="button" onClick={() => acted++}>
            Star
          </button>
        }
      />
    ));
    const link = screen.getByRole("link", { name: "Northwind" });
    expect(link.getAttribute("href")).toBe("/projects/northwind");
    expect(wears(slot("tile"), tileStyles({ interactive: true }).root)).toBe(true);
    user.tab();
    expect(document.activeElement).toBe(link);
    user.tab();
    await user.keyboard("{Enter}");
    expect(acted).toBe(1);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with onPress the title is a button", async () => {
    let pressed = 0;
    render(() => <Tile title="Starter" onPress={() => pressed++} />);
    user.tap(screen.getByRole("button", { name: "Starter" }));
    await settle();
    expect(pressed).toBe(1);
  });

  test("selectable: a checkbox named by the title, the whole tile toggling it", async () => {
    const [picked, setPicked] = createSignal(false);
    render(() => (
      <Tile
        title="Starter"
        description="For one person"
        selected={picked()}
        onSelectedChange={setPicked}
      />
    ));
    const box = screen.getByRole("checkbox", { name: "Starter" });
    expect(box.getAttribute("aria-checked") ?? String((box as HTMLInputElement).checked)).toBe(
      "false",
    );
    user.click(slot("tile-description"));
    await settle();
    expect(picked()).toBe(true);
    expect(slot("tile").hasAttribute("data-selected")).toBe(true);
    expect(wears(slot("tile"), tileStyles({ selected: true }).root)).toBe(true);
    user.click(box);
    await settle();
    expect(picked()).toBe(false);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("media at the start, right to left, with renders and a class per part", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Tile
          class="mine"
          title="قالب"
          eyebrow="e"
          description="d"
          media={<img src="/a.png" alt="" />}
          mediaPosition="start"
          footer="f"
          actions={<span>a</span>}
          defaultSelected
          renders={{
            title: (part, content) => (
              <h3 {...part.props} ref={part.ref}>
                {content}
              </h3>
            ),
          }}
          classes={{
            root: "r",
            media: "m",
            body: "b",
            header: "hd",
            heading: "hg",
            eyebrow: "e",
            title: "t",
            description: "d",
            footer: "f",
            actions: "a",
            check: "c",
          }}
        />
      </Arabic>
    ));
    expect(screen.getByRole("heading", { level: 3, name: "قالب" })).toBeDefined();
    const pairs = [
      ["tile", "r"],
      ["tile-media", "m"],
      ["tile-body", "b"],
      ["tile-header", "hd"],
      ["tile-heading", "hg"],
      ["tile-eyebrow", "e"],
      ["tile-title", "t"],
      ["tile-description", "d"],
      ["tile-footer", "f"],
      ["tile-actions", "a"],
      ["tile-check", "c"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("tile").classList.contains("mine")).toBe(true);
    expect(wears(slot("tile"), tileStyles({ mediaPosition: "start", selected: true }).root)).toBe(
      true,
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Tile } from "<arc>";
      export function Page() {
        return (
          <div>
            <Tile title="One" href="/one" description="First" />
            <Tile title="Two" defaultSelected />
          </div>
        );
      }
    `);
    expect(result.container.querySelector("a")?.getAttribute("href")).toBe("/one");
    result.unmount();
  });
});
