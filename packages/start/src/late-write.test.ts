/**
 * A header, a status or a cookie written after the response went out changes
 * nothing the browser receives. That used to be silent; it is a finding now,
 * naming the call and where it was made.
 */

import { describe, expect, test } from "bun:test";

import { DEV } from "@barqjs/core";

import {
  createResponseDraft,
  getResponseHeader,
  markResponseSent,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  withRequest,
} from "./index.ts";
import { holdReports } from "./test-console.ts";

const request = (): Request => new Request("https://example.com/profile/salama");

function loadProfileLate(): void {
  setResponseHeader("cache-control", "no-store");
}

describe("a write after the response was sent", () => {
  holdReports("LATE_HEADER_WRITE");

  test("is reported with the call and the code that made it", () => {
    const draft = createResponseDraft();
    const capture = DEV.diagnostics.capture();
    withRequest(
      request(),
      () => {
        setResponseHeader("x-early", "1");
        markResponseSent(draft);
        loadProfileLate();
      },
      { response: draft },
    );
    const events = capture.stop().filter((event) => event.code === "LATE_HEADER_WRITE");
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.severity).toBe("warn");
    expect(event?.message).toStartWith(
      '`setResponseHeader("cache-control")` ran at loadProfileLate (',
    );
    expect(event?.message).toContain("late-write.test.ts:");
    expect(event?.message).toContain(
      "after the response's status and headers had been sent, so it changed nothing the browser receives.",
    );
    expect(event?.data?.call).toBe('setResponseHeader("cache-control")');
    expect(event?.docs).toEndWith("/packages/core/docs/diagnostics/LATE_HEADER_WRITE.md");
  });

  test("covers the status and cookies, and a write before the response went out is quiet", () => {
    const draft = createResponseDraft();
    const capture = DEV.diagnostics.capture();
    withRequest(
      request(),
      () => {
        setResponseStatus(201);
        setCookie("theme", "dark");
        expect(getResponseHeader("set-cookie")).toContain("theme=dark");
        markResponseSent(draft);
        setResponseStatus(404);
        setCookie("session", "salama");
      },
      { response: draft },
    );
    expect(
      capture
        .stop()
        .filter((event) => event.code === "LATE_HEADER_WRITE")
        .map((event) => event.data?.call),
    ).toEqual(["setResponseStatus(404)", 'setCookie("session")']);
  });
});
