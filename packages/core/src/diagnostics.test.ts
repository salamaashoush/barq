/**
 * Dev diagnostics (Solid 2.0-style structured events).
 */

import { describe, expect, test } from "bun:test";
import {
  DEV,
  type Owner,
  computed,
  createScope,
  effect,
  flush,
  getOwner,
  onCleanup,
  runWithOwner,
  signal,
} from "./signals.ts";

describe("DEV.diagnostics", () => {
  test("REACTIVE_WRITE_IN_OWNED_SCOPE warns on writes inside derived computations", () => {
    const capture = DEV.diagnostics.capture();
    const s = signal(0, { name: "victim" });
    const c = computed(() => {
      s.set(1); // write inside a pure computation
      return s();
    });
    c();
    const events = capture.stop();

    const hit = events.find((e) => e.code === "REACTIVE_WRITE_IN_OWNED_SCOPE");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("warning");
    expect(hit!.nodeName).toBe("victim");
  });

  test("ownedWrite: true suppresses the owned-scope warning", () => {
    const capture = DEV.diagnostics.capture();
    const s = signal(0, { ownedWrite: true });
    const c = computed(() => {
      s.set(1);
      return s();
    });
    c();
    const events = capture.stop();
    expect(events.find((e) => e.code === "REACTIVE_WRITE_IN_OWNED_SCOPE")).toBeUndefined();
  });

  test("writes from effects do not warn (only derived computations)", () => {
    const capture = DEV.diagnostics.capture();
    const s = signal(0);
    const other = signal(0);
    effect(() => {
      other();
      s.set(5);
    });
    flush();
    const events = capture.stop();
    expect(events.find((e) => e.code === "REACTIVE_WRITE_IN_OWNED_SCOPE")).toBeUndefined();
  });

  test("RUN_WITH_DISPOSED_OWNER warns", () => {
    let disposedOwner: Owner | null = null;
    createScope((dispose) => {
      disposedOwner = getOwner();
      dispose();
    });

    const capture = DEV.diagnostics.capture();
    runWithOwner(disposedOwner, () => 1);
    const events = capture.stop();
    expect(events.find((e) => e.code === "RUN_WITH_DISPOSED_OWNER")).toBeDefined();
  });

  test("NO_OWNER_CLEANUP warns when onCleanup has no owner", () => {
    const capture = DEV.diagnostics.capture();
    onCleanup(() => {});
    const events = capture.stop();
    expect(events.find((e) => e.code === "NO_OWNER_CLEANUP")).toBeDefined();
  });

  test("subscribe receives events and unsubscribes", () => {
    const seen: string[] = [];
    const unsub = DEV.diagnostics.subscribe((e) => seen.push(e.code));
    onCleanup(() => {});
    unsub();
    onCleanup(() => {});
    expect(seen).toEqual(["NO_OWNER_CLEANUP"]);
  });
});
