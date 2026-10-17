import { DEV, createRoot } from "@barqjs/core";
import { getRequestEvent, httpHeader, httpStatus } from "@barqjs/web";
import { describe, expect, test } from "bun:test";

import { provideRequestEvent } from "./storage.ts";
import { expectOnly, printedBy } from "./test-console.ts";

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

  test("leave a committed head alone, declaring and retracting", async () => {
    const given = event();
    const capture = DEV.diagnostics.capture();
    const printed = await printedBy(() =>
      provideRequestEvent(given, () => {
        createRoot((dispose) => {
          httpStatus(404);
          given.response.committed = true;
          httpStatus(500);
          dispose();
        });
      }),
    );
    const late = capture.stop().filter((found) => found.code === "LATE_HEADER_WRITE");

    expect(given.response.status).toBe(404);
    expect(late.map((found) => found.data?.call)).toEqual(["httpStatus(500)"]);
    expectOnly(printed, "LATE_HEADER_WRITE");
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
