import { createRoot, getRequestEvent, httpHeader, httpStatus } from "@barqjs/core";
import { describe, expect, test } from "bun:test";

import { provideRequestEvent } from "./storage.ts";

const event = () => ({
  request: new Request("https://example.com/account"),
  locals: { user: "salama" },
  response: { headers: new Headers() } as {
    headers: Headers;
    status?: number;
    committed?: boolean;
  },
});

describe("the request event", () => {
  test("is undefined outside a request", () => {
    expect(getRequestEvent()).toBeUndefined();
  });

  test("is the one provided, across an await", async () => {
    const given = event();
    const seen = await provideRequestEvent(given, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return getRequestEvent();
    });

    expect(seen).toBe(given);
    expect(seen?.locals.user).toBe("salama");
  });
});

describe("httpStatus and httpHeader", () => {
  test("declare for as long as their scope lives, and retract when it goes while the head is open", () => {
    const given = event();
    provideRequestEvent(given, () => {
      httpStatus(200);
      createRoot((dispose) => {
        httpStatus(404);
        httpHeader("cache-control", "no-store");
        expect(given.response.status).toBe(404);
        expect(given.response.headers.get("cache-control")).toBe("no-store");
        dispose();
      });
    });

    expect(given.response.status).toBe(200);
    expect(given.response.headers.has("cache-control")).toBe(false);
  });

  test("leave a committed head alone, declaring and retracting", () => {
    const given = event();
    provideRequestEvent(given, () => {
      createRoot((dispose) => {
        httpStatus(404);
        given.response.committed = true;
        httpStatus(500);
        dispose();
      });
    });

    expect(given.response.status).toBe(404);
  });

  test("keep every set-cookie line a scope added when it retracts its own", () => {
    const given = event();
    given.response.headers.append("set-cookie", "a=1");
    provideRequestEvent(given, () => {
      createRoot((dispose) => {
        httpHeader("set-cookie", "b=2", { append: true });
        expect(given.response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
        dispose();
      });
    });

    expect(given.response.headers.getSetCookie()).toEqual(["a=1"]);
  });
});
