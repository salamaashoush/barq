import { afterEach, describe, expect, test } from "bun:test";
import {
  clearSnapshots,
  computed,
  createScope,
  effect,
  flush,
  getOwner,
  markSnapshotScope,
  releaseSnapshotScope,
  setSnapshotCapture,
  signal,
  untrack,
} from "./index.ts";

afterEach(() => {
  clearSnapshots();
});

describe("snapshot capture", () => {
  test("a scope reads captured values instead of live ones", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(1);
      a.set(99); // live value moves on

      let seen = 0;
      createScope(() => {
        markSnapshotScope(getOwner()!);
        const view = computed(() => a());
        seen = untrack(() => view());
      });

      expect(seen).toBe(1); // the captured value, not 99
      return d;
    }, true);
    dispose();
  });

  test("outside a snapshot scope the live value wins", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(1);
      a.set(99);
      const view = computed(() => a());
      expect(untrack(() => view())).toBe(99);
      return d;
    }, true);
    dispose();
  });

  test("releasing the scope re-runs computations served a diverged snapshot", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(1);
      a.set(99);

      const seen: number[] = [];
      let scopeOwner!: ReturnType<typeof getOwner>;
      createScope(() => {
        scopeOwner = getOwner();
        markSnapshotScope(scopeOwner!);
        effect(() => {
          seen.push(a());
        });
      });
      flush();
      expect(seen).toEqual([1]);

      releaseSnapshotScope(scopeOwner!);
      flush();
      expect(seen).toEqual([1, 99]);
      return d;
    }, true);
    dispose();
  });

  test("a snapshot that matches the live value does not force a re-run", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(7); // never written, so snapshot === live

      const seen: number[] = [];
      let scopeOwner!: ReturnType<typeof getOwner>;
      createScope(() => {
        scopeOwner = getOwner();
        markSnapshotScope(scopeOwner!);
        effect(() => {
          seen.push(a());
        });
      });
      flush();
      expect(seen).toEqual([7]);

      releaseSnapshotScope(scopeOwner!);
      flush();
      expect(seen).toEqual([7]);
      return d;
    }, true);
    dispose();
  });

  test("signals created before capture started have no snapshot", () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      setSnapshotCapture(true);
      a.set(99);

      let seen = 0;
      createScope(() => {
        markSnapshotScope(getOwner()!);
        seen = untrack(() => computed(() => a())());
      });
      expect(seen).toBe(99);
      return d;
    }, true);
    dispose();
  });

  test("noSnapshot opts a signal out of capture", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(1, { noSnapshot: true });
      a.set(99);

      let seen = 0;
      createScope(() => {
        markSnapshotScope(getOwner()!);
        seen = untrack(() => computed(() => a())());
      });
      expect(seen).toBe(99);
      return d;
    }, true);
    dispose();
  });

  test("clearSnapshots drops the captured values and stops capture", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(1);
      a.set(99);
      clearSnapshots();

      let seen = 0;
      createScope(() => {
        markSnapshotScope(getOwner()!);
        seen = untrack(() => computed(() => a())());
      });
      expect(seen).toBe(99);
      return d;
    }, true);
    dispose();
  });

  test("nested scopes keep their own release", () => {
    const dispose = createScope((d) => {
      setSnapshotCapture(true);
      const a = signal(1);
      a.set(99);

      const outerSeen: number[] = [];
      const innerSeen: number[] = [];
      let outerOwner!: ReturnType<typeof getOwner>;
      let innerOwner!: ReturnType<typeof getOwner>;

      createScope(() => {
        outerOwner = getOwner();
        markSnapshotScope(outerOwner!);
        effect(() => {
          outerSeen.push(a());
        });
        createScope(() => {
          innerOwner = getOwner();
          markSnapshotScope(innerOwner!);
          effect(() => {
            innerSeen.push(a());
          });
        });
      });
      flush();
      expect(outerSeen).toEqual([1]);
      expect(innerSeen).toEqual([1]);

      releaseSnapshotScope(outerOwner!);
      flush();
      expect(outerSeen).toEqual([1, 99]);
      expect(innerSeen).toEqual([1]); // inner scope still held

      releaseSnapshotScope(innerOwner!);
      flush();
      expect(innerSeen).toEqual([1, 99]);
      return d;
    }, true);
    dispose();
  });

  test("capture off by default leaves reads untouched", () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      a.set(99);
      let seen = 0;
      createScope(() => {
        markSnapshotScope(getOwner()!);
        seen = untrack(() => computed(() => a())());
      });
      expect(seen).toBe(99);
      return d;
    }, true);
    dispose();
  });
});
