/**
 * The isomorphic entry has to survive reaching a browser.
 *
 * `@barqjs/start` is documented as isomorphic — `createServerFn`, the context,
 * sessions, cookies — and an application reaches it from a module the client
 * graph can see whenever a route names a middleware closure for the build's
 * chain check. That is not avoidable from the application: the check compares
 * references, so the route imports the same binding the server function
 * carries.
 *
 * `context.ts` used to build its `AsyncLocalStorage` at module scope. Bundlers
 * answer `node:async_hooks` with an empty stub rather than an error, so the
 * chunk evaluated and threw `AsyncLocalStorage is not a constructor` on a page
 * that never called a server API. Measured on `packages/kitchen-sink`: the
 * `/admin` route crashed on load.
 */

import { describe, expect, test } from "bun:test";

import {
  collectRequestCss,
  getRequest,
  installCssSink,
  peekRequest,
  peekResponseDraft,
  withRequest,
} from "./context.ts";

describe("outside a request", () => {
  test("reading does not construct the storage, and says what is missing", () => {
    expect(peekRequest()).toBeUndefined();
    expect(peekResponseDraft()).toBeUndefined();
    expect(() => getRequest()).toThrow("only available inside a request");
  });
});

describe("inside a request", () => {
  test("the ambient request is the one that was entered", () => {
    const request = new Request("https://example.com/admin");
    const seen = withRequest(request, () => getRequest());
    expect(seen).toBe(request);
    expect(peekRequest(), "the context outlived the call that entered it").toBeUndefined();
  });

  test("two requests in flight do not see each other", async () => {
    const first = new Request("https://example.com/one");
    const second = new Request("https://example.com/two");

    const [a, b] = await Promise.all([
      withRequest(first, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getRequest().url;
      }),
      withRequest(second, async () => getRequest().url),
    ]);

    expect(a).toBe("https://example.com/one");
    expect(b).toBe("https://example.com/two");
  });
});

/**
 * A server imports the application once and serves forever, so a rule a
 * component body registers belongs to ONE request. Without this split a render
 * of `/css` left its rules in a module-level map and `/about` inlined them.
 */
describe("the per-request CSS bucket", () => {
  const sink = { fn: null as null | ((key: string, rules: string) => boolean) };
  installCssSink((fn) => {
    sink.fn = fn;
  });
  const register = (key: string, rules: string): boolean =>
    sink.fn === null ? false : sink.fn(key, rules);

  test("a rule registered outside a request is refused, so it lands in the shared sheet", () => {
    expect(register("module-scope", ".a{color:red}")).toBe(false);
    expect(collectRequestCss()).toBe("");
  });

  test("a rule registered during a request is that request's alone", () => {
    const one = withRequest(new Request("https://example.com/a"), () => {
      register("k", ".one{color:red}");
      return collectRequestCss();
    });
    const two = withRequest(new Request("https://example.com/b"), () => collectRequestCss());
    expect(one).toBe(".one{color:red}");
    expect(two).toBe("");
  });

  test("the same key registered twice in one request is one rule", () => {
    const sheet = withRequest(new Request("https://example.com/c"), () => {
      register("k", ".x{color:red}");
      register("k", ".x{color:red}");
      return collectRequestCss();
    });
    expect(sheet).toBe(".x{color:red}");
  });

  test("two requests in flight at once do not take each other's rules", async () => {
    const render = (name: string, delay: number): Promise<string> =>
      withRequest(new Request(`https://example.com/${name}`), async () => {
        register(name, `.${name}{color:red}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return collectRequestCss();
      });
    const [a, b] = await Promise.all([render("first", 20), render("second", 5)]);
    expect(a).toBe(".first{color:red}");
    expect(b).toBe(".second{color:red}");
  });
});
