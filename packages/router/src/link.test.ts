/**
 * `<Link>`'s prop surface, at the two functions both backends share.
 *
 * `linkHref` builds the target and `linkIsActive` decides "you are here", and
 * the DOM path and the string path call exactly these — so testing them tests
 * both, without a DOM.
 */

import { flush } from "@barqjs/core";
import { insert, render, spread } from "@barqjs/web";
import { afterEach, describe, expect, test } from "bun:test";

import {
  Link,
  NavLink,
  RouterProvider,
  createLink,
  linkHref,
  linkIsActive,
  linkOptions,
  useLinkProps,
} from "./components.ts";
import { memoryHistory } from "./history.ts";
import { type AnyRouteDefinition } from "./route.ts";
import { type RouterState, createRouter } from "./router.ts";

const table = [
  { path: "/", component: (() => null) as never },
  { path: "/posts", component: (() => null) as never },
  { path: "/posts/$id", component: (() => null) as never },
] as never as AnyRouteDefinition[];

const at = (initial: string, trailingSlash?: "always" | "never" | "preserve") =>
  createRouter({
    routeTree: table,
    history: memoryHistory({ initial: [initial] }),
    trailingSlash,
  });

/** Props reach these functions already read, so a plain object stands in. */
const href = (state: ReturnType<typeof at>, props: Record<string, unknown>): string =>
  linkHref(state, props as never);

describe("what a link addresses", () => {
  test("a hash rides into the href", () => {
    expect(href(at("/"), { to: "/posts", hash: "install" })).toBe("/posts#install");
    // A `#` the author already wrote is not doubled.
    expect(href(at("/"), { to: "/posts", hash: "#install" })).toBe("/posts#install");
  });

  test("a hash sits after the query", () => {
    expect(href(at("/"), { to: "/posts", search: { tab: "a" }, hash: "x" })).toBe("/posts?tab=a#x");
  });

  /**
   * The functional `search`, which is the reason to have one: a link that edits
   * one key keeps the rest instead of replacing the query.
   */
  test("a functional search is handed the current query", () => {
    const state = at("/posts?tab=a&page=1");
    expect(
      href(state, { to: "/posts", search: (c: Record<string, string>) => ({ ...c, page: "2" }) }),
    ).toBe("/posts?tab=a&page=2");
  });

  test("`from` pins what a relative `to` resolves against", () => {
    const state = at("/posts/7");
    // Without `from`, against the current location.
    expect(href(state, { to: "../" })).toBe("/posts");
    // With it, against what the link says instead.
    expect(href(state, { to: "../", from: "/posts/7/edit" })).toBe("/posts/7");
  });
});

describe("what counts as active", () => {
  test("the default is a segment-prefix match on the pathname", () => {
    const state = at("/posts/7");
    expect(linkIsActive(state, "/posts", false)).toBe(true);
    expect(linkIsActive(state, "/posts", true)).toBe(false);
  });

  /**
   * The bug `activeOptions` closes: a paginating nav marked every link active
   * because only the pathname was compared.
   */
  test("`includeSearch` makes the query participate", () => {
    const state = at("/posts?tab=a&page=2");
    expect(linkIsActive(state, "/posts?page=2", true, { includeSearch: true })).toBe(true);
    expect(linkIsActive(state, "/posts?page=3", true, { includeSearch: true })).toBe(false);
    // Without it the query is ignored, which is the old behaviour.
    expect(linkIsActive(state, "/posts?page=3", true)).toBe(true);
  });

  /** A SUBSET, so a tab link is active beside a paginator. */
  test("`includeSearch` is a subset test, not an equality", () => {
    const state = at("/posts?tab=a&page=2");
    expect(linkIsActive(state, "/posts?tab=a", true, { includeSearch: true })).toBe(true);
  });

  test("`includeHash` makes the fragment participate", () => {
    const state = at("/posts#usage");
    expect(linkIsActive(state, "/posts#usage", true, { includeHash: true })).toBe(true);
    expect(linkIsActive(state, "/posts#install", true, { includeHash: true })).toBe(false);
  });

  test("`exact` is `end` under the other name", () => {
    const state = at("/posts/7");
    expect(linkIsActive(state, "/posts", false, { exact: true })).toBe(false);
    expect(linkIsActive(state, "/posts/7", false, { exact: true })).toBe(true);
  });

  /**
   * A link carrying a query is compared on its PATHNAME. Before the split it
   * compared the whole string and never matched.
   */
  test("a link with a query is still active on its path", () => {
    const state = at("/posts");
    expect(linkIsActive(state, "/posts?tab=a", true)).toBe(true);
  });
});

describe("trailingSlash", () => {
  test('"always" writes one, and the query still follows the path', () => {
    expect(href(at("/", "always"), { to: "/posts" })).toBe("/posts/");
    expect(href(at("/", "always"), { to: "/posts", search: { tab: "a" } })).toBe("/posts/?tab=a");
    expect(href(at("/", "always"), { to: "/posts/$id", params: { id: "7" } })).toBe("/posts/7/");
    expect(href(at("/", "always"), { to: "/" })).toBe("/");
  });

  test('"preserve" writes what the caller wrote', () => {
    expect(href(at("/", "preserve"), { to: "/posts/" })).toBe("/posts/");
    expect(href(at("/", "preserve"), { to: "/posts" })).toBe("/posts");
  });

  test('"never" is the default and is what barq always did', () => {
    expect(href(at("/"), { to: "/posts/" })).toBe("/posts");
    expect(href(at("/", "never"), { to: "/posts/" })).toBe("/posts");
  });

  test("active ignores the slash on either side", () => {
    // The location a browser arrived at is whatever was typed, so neither
    // spelling of "here" may decide whether a link is lit.
    expect(linkIsActive(at("/posts/"), "/posts", true)).toBe(true);
    expect(linkIsActive(at("/posts"), "/posts/", true)).toBe(true);
    expect(linkIsActive(at("/posts/"), "/posts/", false)).toBe(true);
    expect(linkIsActive(at("/posts/"), "/posts/$id", true)).toBe(false);
  });
});

describe("navigate honours the policy", () => {
  test('"always" pushes the slashed spelling', async () => {
    const router = at("/", "always");
    await router.navigate("/posts");
    expect(router.location().pathname).toBe("/posts/");
    await router.navigate("/");
    expect(router.location().pathname).toBe("/");
  });

  test("the slashed spelling still matches the route", async () => {
    const router = at("/", "always");
    await router.navigate("/posts/7");
    expect(router.location().pathname).toBe("/posts/7/");
    expect(router.params()).toEqual({ id: "7" });
  });

  test('"preserve" keeps a relative navigation as written', async () => {
    const router = at("/posts", "preserve");
    await router.navigate("7/");
    expect(router.location().pathname).toBe("/posts/7/");
    await router.navigate("/posts/8");
    expect(router.location().pathname).toBe("/posts/8");
  });
});

/**
 * Everything below renders a real anchor under a real provider, because what it
 * checks is what a click, a hover and a location change DO.
 */
describe("a rendered link", () => {
  const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const loads: string[] = [];
  const routes = (home: () => unknown): AnyRouteDefinition[] =>
    [
      {
        path: "/",
        component: home,
      },
      {
        path: "/posts/$id",
        component: () => document.createTextNode("post"),
        loader: ({ params }: { params: { id: string } }) => {
          loads.push(params.id);
          return params.id;
        },
      },
      { path: "/feed", component: () => document.createTextNode("feed") },
    ] as never;

  /** The home route renders `home`, so whatever it builds is under the provider. */
  const mounted = (
    home: () => unknown,
    config: Record<string, unknown> = {},
  ): { state: RouterState; host: HTMLElement; dispose: () => void } => {
    loads.length = 0;
    const state = createRouter({
      routeTree: routes(home),
      history: memoryHistory({ initial: ["/"] }),
      ...config,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(
      (() =>
        (RouterProvider as never as (p: unknown) => unknown)({
          state: () => state,
        })) as never,
      host,
    );
    flush();
    return { state, host, dispose };
  };

  /** Props as the compiler hands them over: each one an accessor. */
  const cells = (props: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(props).map(([name, value]) => [
        name,
        name.startsWith("on") ? value : () => value,
      ]),
    );

  const anchor = (
    props: Record<string, unknown>,
    component: unknown = Link,
    config?: Record<string, unknown>,
  ): { state: RouterState; element: HTMLAnchorElement; dispose: () => void } => {
    const { state, host, dispose } = mounted(
      () => (component as (p: unknown) => Node)(cells({ children: "go", ...props })),
      config,
    );
    return { state, element: host.querySelector("a") as HTMLAnchorElement, dispose };
  };

  const click = (element: Element): MouseEvent => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    element.dispatchEvent(event);
    return event;
  };

  test("a click commits the location its href shows: params, search updater and hash", async () => {
    const { state, element, dispose } = anchor({
      to: "/posts/$id",
      params: { id: "7" },
      search: (current: Record<string, unknown>) => ({ ...current, tab: "a" }),
      hash: "top",
      state: { via: "link" },
    });
    expect(element.getAttribute("href")).toBe("/posts/7?tab=a#top");
    const event = click(element);
    expect(event.defaultPrevented).toBe(true);
    await tick();
    expect(state.location().pathname + state.location().search + state.location().hash).toBe(
      "/posts/7?tab=a#top",
    );
    expect(state.location().state).toEqual({ via: "link" });
    dispose();
  });

  test("`mask` shows one url and renders another", async () => {
    const { state, element, dispose } = anchor({
      to: "/posts/$id",
      params: { id: "5" },
      mask: { to: "/feed" },
    });
    click(element);
    await tick();
    expect(state.history.current().pathname).toBe("/feed");
    expect(state.match()?.route.id).toBe("/posts/$id");
    dispose();
  });

  test("`reloadDocument` leaves the click to the browser, and nothing is committed", async () => {
    const { state, element, dispose } = anchor({ to: "/posts/7", reloadDocument: true });
    const event = click(element);
    await tick();
    // Not prevented, so the anchor navigates the document itself.
    expect(event.defaultPrevented).toBe(false);
    expect(state.location().pathname).toBe("/");
    dispose();
  });

  test("`preloadDelay` is how long a hover has to last before it warms anything", async () => {
    const { element, dispose } = anchor({ to: "/posts/7", preload: "intent", preloadDelay: 40 });
    element.dispatchEvent(new Event("mouseenter"));
    await tick(15);
    expect(loads).toEqual([]);
    await tick(50);
    expect(loads).toEqual(["7"]);
    dispose();

    // Leaving inside the window is not intent at all.
    const second = anchor({ to: "/posts/8", preload: "intent", preloadDelay: 40 });
    second.element.dispatchEvent(new Event("mouseenter"));
    await tick(10);
    second.element.dispatchEvent(new Event("mouseleave"));
    await tick(60);
    expect(loads).toEqual([]);
    second.dispose();
  });

  test("the router's `defaultPreloadDelay` is the delay a link does not give", async () => {
    const { element, dispose } = anchor({ to: "/posts/7", preload: "intent" }, Link, {
      defaultPreloadDelay: 5,
    });
    element.dispatchEvent(new Event("mouseenter"));
    await tick(25);
    expect(loads).toEqual(["7"]);
    dispose();
  });

  test("a plain Link with `activeProps` marks itself, and flips when the location moves", async () => {
    loads.length = 0;
    const state = createRouter({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          // A layout, so the link SURVIVES the navigation it is watching.
          component: (props: { children: unknown }) => {
            const nav = document.createElement("nav");
            nav.append(
              (Link as never as (p: unknown) => Node)(
                cells({
                  to: "/feed",
                  class: "nav",
                  activeProps: { class: "on", "data-state": "open" },
                  inactiveProps: { title: "go to feed" },
                  children: "feed",
                }),
              ),
            );
            insert(nav, () => props.children as never);
            return nav;
          },
          children: [
            { id: "/", path: "", component: () => document.createTextNode("home") },
            { id: "/feed", path: "feed", component: () => document.createTextNode("feed") },
          ],
        },
      ] as never,
      history: memoryHistory({ initial: ["/"] }),
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(
      (() =>
        (RouterProvider as never as (p: unknown) => unknown)({
          state: () => state,
        })) as never,
      host,
    );
    flush();
    const element = host.querySelector("a") as HTMLAnchorElement;
    expect(element.className).toBe("nav");
    expect(element.getAttribute("aria-current")).toBeNull();
    expect(element.getAttribute("data-state")).toBeNull();
    expect(element.getAttribute("title")).toBe("go to feed");

    await state.navigate("/feed");
    flush();
    expect(host.querySelector("a")).toBe(element);
    expect(element.className).toBe("nav on");
    expect(element.getAttribute("aria-current")).toBe("page");
    expect(element.getAttribute("data-status")).toBe("active");
    expect(element.getAttribute("data-state")).toBe("open");
    // Set by the inactive record only, so the flip takes it away.
    expect(element.getAttribute("title")).toBeNull();
    dispose();
  });

  test("an active NavLink carries aria-current, data-status and its active record", async () => {
    const { element, dispose } = anchor(
      {
        to: "/",
        class: "nav",
        activeProps: () => ({ class: "on", "data-state": "open" }),
        inactiveProps: { title: "elsewhere" },
        activeOptions: { exact: true },
      },
      NavLink,
    );
    expect(element.className).toBe("nav active on");
    expect(element.getAttribute("aria-current")).toBe("page");
    expect(element.getAttribute("data-status")).toBe("active");
    expect(element.getAttribute("data-state")).toBe("open");
    // Present in the inactive record only, so it is absent while active.
    expect(element.getAttribute("title")).toBeNull();
    dispose();
  });

  test("useLinkProps is a link's behaviour for an element the caller draws", async () => {
    const clicked: string[] = [];
    const { state, host, dispose } = mounted(() => {
      const props = useLinkProps({
        to: "/posts/$id",
        params: { id: "7" },
        search: { tab: "a" },
        activeProps: { class: "on" },
        id: "custom",
        onClick: () => clicked.push("caller"),
      });
      const element = document.createElement("a");
      spread(element, props);
      element.append("go");
      return element;
    });
    const element = host.querySelector("a") as HTMLAnchorElement;
    expect(element.getAttribute("href")).toBe("/posts/7?tab=a");
    expect(element.id).toBe("custom");
    expect(element.getAttribute("aria-current")).toBeNull();
    const event = click(element);
    expect(clicked).toEqual(["caller"]);
    expect(event.defaultPrevented).toBe(true);
    await tick();
    expect(state.location().pathname).toBe("/posts/7");
    dispose();
  });

  test("a caller's handler that prevents the click keeps the link from navigating", async () => {
    const { state, host, dispose } = mounted(() => {
      const props = useLinkProps({
        to: "/posts/7",
        onClick: (event: Event) => event.preventDefault(),
      });
      const element = document.createElement("a");
      spread(element, props);
      return element;
    });
    click(host.querySelector("a") as HTMLAnchorElement);
    await tick();
    expect(state.location().pathname).toBe("/");
    dispose();
  });

  test("createLink gives a component of the caller's the same behaviour", async () => {
    const Fancy = createLink((props) => {
      const element = document.createElement("a");
      element.dataset.fancy = "yes";
      spread(element, props);
      element.append(String((props.children as () => unknown)()));
      return element;
    });
    const { state, element, dispose } = anchor(
      { to: "/posts/$id", params: { id: "9" }, children: "open" },
      Fancy,
    );
    expect(element.dataset.fancy).toBe("yes");
    expect(element.getAttribute("href")).toBe("/posts/9");
    expect(element.textContent).toBe("open");
    click(element);
    await tick();
    expect(state.location().pathname).toBe("/posts/9");
    dispose();
  });

  test("linkOptions hands back what it was given, for a link and a navigate to share", async () => {
    const options = linkOptions({ to: "/posts/$id", params: { id: "4" }, search: { tab: "b" } });
    expect(options).toEqual({ to: "/posts/$id", params: { id: "4" }, search: { tab: "b" } });
    const { state, element, dispose } = anchor(options);
    expect(element.getAttribute("href")).toBe("/posts/4?tab=b");
    await state.navigate(options);
    expect(state.location().pathname + state.location().search).toBe("/posts/4?tab=b");
    dispose();
  });
});
