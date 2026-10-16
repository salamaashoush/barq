/**
 * `getTraceContext`: the W3C trace a request belongs to, read where the
 * request is, and handed to the browser only when something upstream records
 * it.
 */

import { type TraceContext, createMemo, getTraceContext } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, describe, expect, test } from "bun:test";

import { commitEventResponse, createRequestEvent, createSSRResponse } from "./index.ts";
import { renderToString } from "./server.ts";
import { html } from "./ssr.ts";
import { provideRequestEvent } from "./storage.ts";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT = "00f067aa0ba902b7";

function tracedRequest(traceparent?: string, extra: Record<string, string> = {}): Request {
  return new Request("https://example.com/orders", {
    headers: traceparent === undefined ? extra : { traceparent, ...extra },
  });
}

afterEach(() => {
  clearHydrationData();
});

describe("getTraceContext", () => {
  test("continues an incoming sampled trace, with its state and baggage", () => {
    const event = createRequestEvent(
      tracedRequest(`00-${TRACE}-${PARENT}-01`, { tracestate: "vendor=1", baggage: "user=salama" }),
    );
    const context = provideRequestEvent(event, () => getTraceContext());

    expect(context?.traceId).toBe(TRACE);
    expect(context?.parentId).toBe(PARENT);
    expect(context?.sampled).toBe(true);
    expect(context?.state).toBe("vendor=1");
    expect(context?.baggage).toBe("user=salama");
    expect(context?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(context?.spanId).not.toBe(PARENT);
    expect(context?.entries.traceparent).toBe(`00-${TRACE}-${context?.spanId}-01`);
  });

  test("is one object for every read inside a request", async () => {
    const event = createRequestEvent(tracedRequest());
    const [first, second] = await provideRequestEvent(event, async () => {
      const early = getTraceContext();
      await new Promise((done) => setTimeout(done, 0));
      return [early, getTraceContext()];
    });

    expect(second).toBe(first);
  });

  test("originates a trace when none came in, and ignores one that is malformed", () => {
    for (const given of [
      undefined,
      `ff-${TRACE}-${PARENT}-01`,
      `00-${"0".repeat(32)}-${PARENT}-01`,
      "junk",
    ]) {
      const context = provideRequestEvent(createRequestEvent(tracedRequest(given)), () =>
        getTraceContext(),
      );
      expect(context?.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(context?.traceId).not.toBe(TRACE);
      expect(context?.parentId).toBeUndefined();
      expect(context?.sampled).toBeUndefined();
    }
  });

  test("is undefined outside a request and a render", () => {
    expect(getTraceContext()).toBeUndefined();
  });

  test("is the render's own outside a request, read within it", () => {
    const seen: { context?: TraceContext } = {};
    renderToString(() => {
      seen.context = getTraceContext();
      createMemo(() => 1);
      return html("<p>static</p>");
    });

    expect(seen.context?.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("the browser is told", () => {
  test("on the committed head and in the document's head, for a sampled trace", () => {
    const event = createRequestEvent(tracedRequest(`00-${TRACE}-${PARENT}-01`));
    const markup = provideRequestEvent(event, () =>
      renderToString(() => html("<html><head><title>orders</title></head><body></body></html>")),
    );
    const response = createSSRResponse(markup, event);
    const traceparent = provideRequestEvent(event, () => getTraceContext()?.entries.traceparent);

    expect(response.headers.get("server-timing")).toBe(`traceparent;desc="${traceparent}"`);
    expect(markup).toContain(`<meta name="traceparent" content="${traceparent}"></head>`);
  });

  test("on a response that left through commitEventResponse, beside its own metrics", () => {
    const event = createRequestEvent(tracedRequest(`00-${TRACE}-${PARENT}-01`));
    const response = commitEventResponse(
      new Response("{}", { headers: { "server-timing": "db;dur=53" } }),
      event,
    );

    expect(response.headers.get("server-timing")).toStartWith("db;dur=53, traceparent;desc=");
  });

  test("never for an unsampled trace or one the runtime originated", () => {
    for (const given of [`00-${TRACE}-${PARENT}-00`, undefined]) {
      const event = createRequestEvent(tracedRequest(given));
      const markup = provideRequestEvent(event, () =>
        renderToString(() => html("<html><head></head><body></body></html>")),
      );
      const response = createSSRResponse(markup, event);

      expect(response.headers.get("server-timing")).toBeNull();
      expect(markup).not.toContain("traceparent");
    }
  });
});
