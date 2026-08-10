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
import { render } from "./dom.ts";

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

  // NO_OWNER_CLEANUP is gone: M2 stopped dropping an ownerless cleanup on the
  // floor. It is held for the next root scope, which claims it and runs it on
  // disposal (O5), so a warning saying "the cleanup will never run" would now
  // be false. The claim it stood for is asserted below on the cleanup itself
  // rather than on the warning, which is the stronger of the two.
  test("an ownerless cleanup is claimed by the next root and runs on dispose", () => {
    const ran: string[] = [];
    onCleanup(() => ran.push("orphan"));
    const host = document.createElement("div");
    const dispose = render(document.createElement("span"), host);
    expect(ran).toEqual([]);
    dispose();
    expect(ran).toEqual(["orphan"]);
  });

  test("subscribe receives events and unsubscribes", () => {
    let disposedOwner: Owner | null = null;
    createScope((dispose) => {
      disposedOwner = getOwner();
      dispose();
    });

    const seen: string[] = [];
    const unsub = DEV.diagnostics.subscribe((e) => seen.push(e.code));
    runWithOwner(disposedOwner, () => 1);
    unsub();
    runWithOwner(disposedOwner, () => 1);
    expect(seen).toEqual(["RUN_WITH_DISPOSED_OWNER"]);
  });
});
