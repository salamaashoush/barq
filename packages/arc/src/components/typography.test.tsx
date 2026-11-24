import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { provideArcMessages } from "./messages.ts";
import { Shortcut, keyLabel } from "./shortcut.tsx";
import { Link, isExternalHref, linkStyles } from "./text-link.tsx";
import { Truncate, truncateStyles } from "./truncate.tsx";
import {
  Code,
  Heading,
  Prose,
  Text,
  codeStyles,
  headingStyles,
  proseStyles,
  textStyles,
} from "./typography.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function Rtl(props: { children?: Child }) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("Heading", () => {
  test("its level is the element and its size is apart from it", () => {
    render(() => (
      <>
        <Heading level={1}>Billing</Heading>
        <Heading level={3} size="2xl">
          Plan
        </Heading>
      </>
    ));
    const one = screen.getByRole("heading", { level: 1, name: "Billing" });
    expect(one.getAttribute("data-size")).toBe("2xl");
    const three = screen.getByRole("heading", { level: 3, name: "Plan" });
    expect(wears(three, headingStyles({ size: "2xl" }).root)).toBe(true);
  });

  test("defaults to an h2 at the level's size, and takes a colour and a cut", () => {
    render(() => (
      <Heading color="muted" truncate class="mine" classes={{ root: "r" }}>
        Payments
      </Heading>
    ));
    const two = screen.getByRole("heading", { level: 2 });
    expect(two.getAttribute("data-size")).toBe("xl");
    expect(two.classList.contains("mine")).toBe(true);
    expect(two.classList.contains("r")).toBe(true);
    expect(wears(two, headingStyles({ size: "xl", color: "muted", truncate: true }).root)).toBe(
      true,
    );
  });

  test("the largest size steps down on a phone", () => {
    const sizes = headingStyles({ size: "3xl" })
      .root.split(" ")
      .filter((one) => one.includes("font-size"));
    expect(sizes.length).toBe(2);
    const sheet = collectCss();
    expect(sheet).toContain("font-size:var(--text-3xl)");
    expect(sheet).toMatch(/@media \(width >= 40rem\)\{[^}]*\{font-size:var\(--text-3xl\)\}/);
  });
});

describe("Text", () => {
  test("a paragraph by default, any of the inline elements on request", () => {
    render(() => (
      <>
        <Text>Invoices go out monthly.</Text>
        <Text as="span" size="xs" color="success" numeric weight="strong">
          12:04
        </Text>
      </>
    ));
    const paragraph = slot("text");
    expect(paragraph.tagName).toBe("P");
    const span = document.querySelectorAll('[data-slot="text"]')[1] as HTMLElement;
    expect(span.tagName).toBe("SPAN");
    expect(
      wears(
        span,
        textStyles({ size: "xs", color: "success", numeric: true, weight: "strong" }).root,
      ),
    ).toBe(true);
  });

  test("cuts at a number of lines", () => {
    render(() => <Text lines={2}>A long comment</Text>);
    expect(wears(slot("text"), textStyles({ lines: 2 }).root)).toBe(true);
  });

  test("as a label it names a control", async () => {
    render(() => (
      <>
        <Text as="label" for="name">
          Name
        </Text>
        <input id="name" />
      </>
    ));
    expect(screen.getByLabelText("Name").tagName).toBe("INPUT");
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("Code and Prose", () => {
  test("Code is a code element in the mono face", () => {
    render(() => (
      <Text>
        Set <Code classes={{ root: "c" }}>API_TOKEN</Code> first.
      </Text>
    ));
    const code = slot("code");
    expect(code.tagName).toBe("CODE");
    expect(code.classList.contains("c")).toBe(true);
    expect(wears(code, codeStyles().root)).toBe(true);
  });

  test("Prose styles the elements inside it, logically, from markup or children", async () => {
    render(() => (
      <>
        <Prose size="sm" html="<h2>Terms</h2><p>Read <a href='/t'>these</a>.</p>" />
        <Prose width="full">
          <blockquote>Quoted</blockquote>
        </Prose>
      </>
    ));
    const [first, second] = [...document.querySelectorAll('[data-slot="prose"]')] as HTMLElement[];
    expect(first?.querySelector("h2")?.textContent).toBe("Terms");
    expect(wears(first, proseStyles({ size: "sm" }).root)).toBe(true);
    expect(wears(second, proseStyles({ width: "full" }).root)).toBe(true);
    expect(second?.querySelector("blockquote")?.textContent).toBe("Quoted");
    const sheet = collectCss();
    expect(sheet).toContain("border-inline-start-width:3px");
    expect(sheet).toContain("padding-inline-start:1.5em");
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("Link", () => {
  test("a link in the app is a plain anchor", () => {
    render(() => <Link href="/settings">Settings</Link>);
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.getAttribute("target")).toBeNull();
    expect(slot("link-external")).toBeNull();
  });

  test("an absolute URL opens a new tab, says so and draws the arrow", async () => {
    render(() => <Link href="https://example.com/terms">Terms</Link>);
    const link = screen.getByRole("link", { name: "Terms (opens in a new tab)" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(slot("link-external").getAttribute("aria-hidden")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("reads which URLs leave the app", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("//example.com/a")).toBe(true);
    expect(isExternalHref("/a")).toBe(false);
    expect(isExternalHref("#top")).toBe(false);
    expect(isExternalHref(undefined)).toBe(false);
  });

  test("works from the keyboard and calls onPress", async () => {
    let pressed = 0;
    render(() => (
      <Link href="#billing" onPress={() => pressed++}>
        Billing
      </Link>
    ));
    user.tab();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("link");
    await user.keyboard("{Enter}");
    expect(pressed).toBe(1);
  });

  test("its words come from arc's dictionary, and its parts take classes", () => {
    function German(props: { children?: Child }) {
      provideArcMessages(() => ({ opensInNewTab: "öffnet einen neuen Tab" }));
      return <>{props.children}</>;
    }
    render(() => (
      <German>
        <Link
          href="https://example.com"
          color="muted"
          underline="hover"
          classes={{ root: "r", external: "e", hint: "h" }}
        >
          Docs
        </Link>
      </German>
    ));
    expect(screen.getByRole("link", { name: "Docs (öffnet einen neuen Tab)" })).toBeDefined();
    expect(slot("link").classList.contains("r")).toBe(true);
    expect(slot("link-external").classList.contains("e")).toBe(true);
    expect(slot("link-hint").classList.contains("h")).toBe(true);
    expect(wears(slot("link"), linkStyles({ color: "muted", underline: "hover" }).root)).toBe(true);
  });
});

describe("Truncate", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  afterEach(() => {
    if (original !== undefined)
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", original);
  });
  function overflowing(): void {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("data-slot") === "truncate-text" ? 80 : 0;
      },
    });
  }

  test("text that fits has no button", async () => {
    render(() => <Truncate lines={2}>Short</Truncate>);
    await settle();
    expect(slot("truncate-toggle")).toBeNull();
    expect(wears(slot("truncate-text"), truncateStyles({ lines: 2 }).text)).toBe(true);
  });

  test("cut text gets a button that shows the rest and takes it back", async () => {
    overflowing();
    const changes: boolean[] = [];
    render(() => (
      <Truncate lines={3} onOpenChange={(open) => changes.push(open)}>
        A long comment that runs on.
      </Truncate>
    ));
    await settle();
    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(slot("truncate-text").id);
    expect(slot("truncate").hasAttribute("data-cut")).toBe(true);
    user.tap(toggle);
    await settle();
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(wears(slot("truncate-text"), truncateStyles({ lines: 3, open: true }).text)).toBe(true);
    expect(changes).toEqual([true]);
    expect(wears(slot("truncate-toggle"), target.size)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("without a button the whole text is the title while it is cut", async () => {
    overflowing();
    render(() => <Truncate expandable={false}>Northwind quarterly review</Truncate>);
    await settle();
    expect(slot("truncate-toggle")).toBeNull();
    expect(slot("truncate-text").getAttribute("title")).toBe("Northwind quarterly review");
  });

  test("works from the keyboard, in either direction, and its parts take classes", async () => {
    overflowing();
    render(() => (
      <Rtl>
        <Truncate classes={{ root: "r", text: "t", toggle: "g" }} class="mine">
          نص طويل
        </Truncate>
      </Rtl>
    ));
    await settle();
    user.tab();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("truncate-toggle");
    await user.keyboard("{Enter}");
    await settle();
    expect(slot("truncate").hasAttribute("data-open")).toBe(true);
    expect(slot("truncate").classList.contains("mine")).toBe(true);
    for (const [name, cls] of [
      ["truncate", "r"],
      ["truncate-text", "t"],
      ["truncate-toggle", "g"],
    ] as const) {
      expect(slot(name).classList.contains(cls)).toBe(true);
    }
    expect(collectCss()).toContain("text-align:start");
  });
});

describe("Shortcut", () => {
  test("writes Mod as Ctrl away from an Apple device, with a separator", async () => {
    render(() => <Shortcut keys="Mod+K" />);
    await settle();
    const keys = [...document.querySelectorAll('[data-slot="shortcut-key"]')].map(
      (one) => one.textContent,
    );
    expect(keys).toEqual(["Ctrl", "K"]);
    expect(slot("shortcut-separator").getAttribute("aria-hidden")).toBe("true");
    expect(slot("shortcut").tagName).toBe("KBD");
  });

  test("names each key as the reader's keyboard does", () => {
    expect(keyLabel("Mod", true)).toBe("⌘");
    expect(keyLabel("Mod", false)).toBe("Ctrl");
    expect(keyLabel("shift", true)).toBe("⇧");
    expect(keyLabel("Enter", false)).toBe("↵");
    expect(keyLabel("k", false)).toBe("K");
  });

  test("takes a look, a size and a class per part", () => {
    render(() => (
      <Shortcut
        keys={["Shift", "Enter"]}
        variant="outline"
        size="sm"
        classes={{ root: "r", key: "k", separator: "s" }}
      />
    ));
    expect(slot("shortcut").classList.contains("r")).toBe(true);
    expect(slot("shortcut-key").classList.contains("k")).toBe(true);
    expect(slot("shortcut-separator").classList.contains("s")).toBe(true);
  });
});

describe("typography hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { Code, Heading, Link, Prose, Shortcut, Text, Truncate } from "<arc>";
      export function Page() {
        return (
          <main>
            <Heading level={1}>Billing</Heading>
            <Text size="xs" color="muted">Updated today</Text>
            <Code>API_TOKEN</Code>
            <Prose html="<p>Hello</p>" />
            <Link href="https://example.com">Docs</Link>
            <Truncate lines={2}>A comment</Truncate>
            <Shortcut keys="Mod+K" />
          </main>
        );
      }
    `);
    expect(result.container.querySelector("h1")?.textContent).toBe("Billing");
    expect(result.container.querySelector('[data-slot="prose"] p')?.textContent).toBe("Hello");
    expect(result.container.querySelector('[data-slot="link"]')?.getAttribute("target")).toBe(
      "_blank",
    );
    result.unmount();
  });
});
