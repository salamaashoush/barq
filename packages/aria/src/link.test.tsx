import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Child, createContext, flush, provide } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { RouterContext, type LinkModifiers, type Router } from "./interactions/open-link.ts";
import { FileTrigger } from "./file-trigger.tsx";
import { Link } from "./link.tsx";
import { provideTriggerSlot } from "./utils.ts";

interface Navigation {
  href: string;
  routerOptions: unknown;
}

function clientRouter(navigations: Navigation[]): Router {
  return {
    isNative: false,
    open: (_target: Element, _modifiers: LinkModifiers, href: string, routerOptions?: unknown) => {
      navigations.push({ href, routerOptions });
    },
    href: (href) => `/base${href}`,
  };
}

interface HappyWindow {
  happyDOM?: HappyDom;
}

interface HappyDom {
  setURL(url: string): void;
}

/** A client router only takes a same-origin navigation, and `about:blank` has no origin. */
const page = window as Window & HappyWindow;

describe("Link: the router", () => {
  beforeEach(() => page.happyDOM?.setURL("http://localhost:3000/"));
  afterEach(() => page.happyDOM?.setURL("about:blank"));

  test("the href is the router's, and a click navigates through it", () => {
    const navigations: Navigation[] = [];
    render(() =>
      provide(
        RouterContext,
        () => clientRouter(navigations),
        () => (
          <Link href="/foo" routerOptions={{ replace: true }}>
            Salama
          </Link>
        ),
      ),
    );
    const link = screen.getByRole("link");

    expect(link.getAttribute("href")).toBe("/base/foo");

    user.click(link);
    expect(navigations).toEqual([{ href: "/foo", routerOptions: { replace: true } }]);
  });

  test("a disabled link does not navigate", () => {
    const navigations: Navigation[] = [];
    render(() =>
      provide(
        RouterContext,
        () => clientRouter(navigations),
        () => (
          <Link href="/foo" isDisabled>
            Salama
          </Link>
        ),
      ),
    );

    user.click(screen.getByRole("link"));
    expect(navigations).toEqual([]);
  });
});

describe("Link: without an href", () => {
  test("is a focusable span with the link role", () => {
    render(() => <Link onPress={() => {}}>Salama</Link>);
    const link = screen.getByRole("link");

    expect(link.tagName).toBe("SPAN");
    expect(link.getAttribute("tabindex")).toBe("0");
  });

  test("a disabled link is a span and out of the Tab order", () => {
    render(() => (
      <Link href="/foo" isDisabled>
        Salama
      </Link>
    ));
    const link = screen.getByRole("link");

    expect(link.tagName).toBe("SPAN");
    expect(link.hasAttribute("tabindex")).toBe(false);
    expect(link.getAttribute("aria-disabled")).toBe("true");
  });

  test("with an href it is an anchor", () => {
    render(() => <Link href="/foo">Salama</Link>);
    expect(screen.getByRole("link").tagName).toBe("A");
  });
});

describe("Link: callbacks", () => {
  test("onHoverStart, onHoverEnd and onHoverChange are called", () => {
    const log: string[] = [];
    render(() => (
      <Link
        href="/foo"
        onHoverStart={(e) => log.push(`start:${e.pointerType}`)}
        onHoverEnd={(e) => log.push(`end:${e.pointerType}`)}
        onHoverChange={(hovered) => log.push(`change:${hovered}`)}
      >
        Salama
      </Link>
    ));
    const link = screen.getByRole("link");

    user.hover(link);
    user.unhover(link);

    expect(log).toEqual(["start:mouse", "change:true", "end:mouse", "change:false"]);
  });

  test("onFocus and onBlur run once each", () => {
    const log: string[] = [];
    render(() => (
      <Link href="/foo" onFocus={() => log.push("focus")} onBlur={() => log.push("blur")}>
        Salama
      </Link>
    ));
    const link = screen.getByRole("link");

    link.focus();
    link.blur();

    expect(log).toEqual(["focus", "blur"]);
  });
});

interface SlottedProps {
  log: string[];
  children?: Child;
}

describe("Link: in a trigger's place", () => {
  function Slotted(props: SlottedProps) {
    return provide(
      createContext(0),
      () => 1,
      () => {
        provideTriggerSlot({
          props: {
            "aria-haspopup": "dialog",
            "aria-expanded": true,
            onPress: () => props.log.push("press"),
          },
          ref: (element) => props.log.push(`ref ${element?.tagName ?? "null"}`),
        });
        return props.children;
      },
    ) as never;
  }

  test("the slot's props, press and ref reach the link", () => {
    const log: string[] = [];
    render(() => (
      <Slotted log={log}>
        <Link href="/people/salama">Salama</Link>
      </Slotted>
    ));
    const element = screen.getByRole("link");
    expect(element.getAttribute("aria-haspopup")).toBe("dialog");
    expect(element.getAttribute("aria-expanded")).toBe("true");
    expect(log).toContain("ref A");

    user.click(element);
    expect(log.filter((entry) => entry === "press")).toHaveLength(1);
  });

  test("a FileTrigger opens its picker from a link", () => {
    render(() => (
      <FileTrigger>
        <Link>Upload</Link>
      </FileTrigger>
    ));
    let clicks = 0;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input.addEventListener("click", () => clicks++);

    user.click(screen.getByRole("link"));
    flush();
    expect(clicks).toBe(1);
  });
});
