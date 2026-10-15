/**
 * A cookie set with no `path` is for the whole site.
 *
 * A browser gives a cookie that names no `Path` the DIRECTORY of the URL that
 * set it (RFC 6265 §5.1.4), and a server function answers at `/_barq/fn/<id>`.
 * Left to that rule its cookie is scoped to `/_barq/fn`: sent back to other
 * server functions and to no page, so a login that set one leaves every loader
 * signed out.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import { DATA_SUFFIX, RPC_PREFIX, deleteCookie, serverRpc, setCookie } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://example.com";

/** The `Set-Cookie` lines a server function running `body` answers with. */
const cookiesFrom = async (body: () => void): Promise<string[]> => {
  mount(
    "src/routes/login.ts#login",
    serverRpc<undefined, null>(
      { id: "src/routes/login.ts#login" },
      {
        validator: null,
        middleware: [],
        handler: () => {
          body();
          return null;
        },
      },
    ),
  );
  const response = await handleServerFn(
    new Request(
      `${ORIGIN}${RPC_PREFIX}${encodeURIComponent("src/routes/login.ts#login")}${DATA_SUFFIX}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ input: encodeWire(undefined) }),
      },
    ),
  );
  return response?.headers.getSetCookie() ?? [];
};

describe("setting", () => {
  test("a cookie given no path is sent to every page, not to `/_barq/fn` alone", async () => {
    expect(await cookiesFrom(() => setCookie("theme", "dark"))).toEqual(["theme=dark; Path=/"]);
  });

  test("a path the caller chose is the one it gets", async () => {
    const lines = await cookiesFrom(() => setCookie("cart", "3", { path: "/shop" }));
    expect(lines).toEqual(["cart=3; Path=/shop"]);
  });

  test("a `__Host-` cookie needs only `secure`, since the path it requires is the default", async () => {
    const lines = await cookiesFrom(() => setCookie("__Host-sid", "abc", { secure: true }));
    expect(lines).toEqual(["__Host-sid=abc; Path=/; Secure"]);
  });
});

describe("deleting", () => {
  test("names the path a default set used, or the browser deletes nothing", async () => {
    const [line = ""] = await cookiesFrom(() => deleteCookie("theme"));
    expect(line).toContain("Path=/;");
    expect(line).toContain("Max-Age=0");
  });

  test("names the path it was told the cookie has", async () => {
    const [line = ""] = await cookiesFrom(() => deleteCookie("cart", { path: "/shop" }));
    expect(line).toContain("Path=/shop;");
  });
});
