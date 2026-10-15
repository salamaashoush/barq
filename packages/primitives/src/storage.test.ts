import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush, createRoot } from "@barqjs/core";
import { clearPersisted, peekPersisted, persisted } from "./storage.ts";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("persisted", () => {
  test("starts from storage when the key is set", () => {
    localStorage.setItem("count", "7");
    const dispose = createRoot((d) => {
      expect(persisted("count", 0)[0]()).toBe(7);
      return d;
    });
    dispose();
  });

  test("does not write the initial value back", () => {
    const dispose = createRoot((d) => {
      persisted("untouched", "a");
      return d;
    });
    expect(localStorage.getItem("untouched")).toBe(null);
    dispose();
  });

  test("writes on change", () => {
    const [dispose, setValue] = createRoot((d) => [d, persisted("theme", "system")[1]] as const);
    setValue("dark");
    flush();
    expect(localStorage.getItem("theme")).toBe('"dark"');
    dispose();
  });

  test("survives a value another tab wrote", () => {
    const dispose = createRoot((d) => {
      const [value] = persisted("shared", 1);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "shared",
          newValue: "9",
          storageArea: localStorage,
        }),
      );
      flush();
      expect(value()).toBe(9);
      return d;
    });
    dispose();
  });

  test("does not write another tab's value straight back", () => {
    const writes: string[] = [];
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      writes.push(k);
      real.call(this, k, v);
    };
    try {
      const dispose = createRoot((d) => {
        const [value] = persisted("echo", 1);
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "echo",
            newValue: "9",
            storageArea: localStorage,
          }),
        );
        flush();
        expect(value()).toBe(9);
        flush();
        return d;
      });
      expect(writes).toEqual([]);
      dispose();
    } finally {
      Storage.prototype.setItem = real;
    }
  });

  test("ignores a storage event for another key or another area", () => {
    const dispose = createRoot((d) => {
      const [value] = persisted("mine", 1);
      window.dispatchEvent(
        new StorageEvent("storage", { key: "other", newValue: "9", storageArea: localStorage }),
      );
      flush();
      window.dispatchEvent(
        new StorageEvent("storage", { key: "mine", newValue: "9", storageArea: sessionStorage }),
      );
      flush();
      expect(value()).toBe(1);
      return d;
    });
    dispose();
  });

  test("a removal elsewhere restores the initial value", () => {
    localStorage.setItem("gone", '"x"');
    const dispose = createRoot((d) => {
      const [value] = persisted("gone", "fallback");
      expect(value()).toBe("x");
      clearPersisted("gone");
      flush();
      expect(value()).toBe("fallback");
      return d;
    });
    dispose();
  });

  test("reports a corrupt value instead of throwing", () => {
    localStorage.setItem("broken", "{not json");
    const errors: string[] = [];
    const dispose = createRoot((d) => {
      const [value] = persisted("broken", "safe", {
        onError: (_error, phase) => errors.push(phase),
      });
      expect(value()).toBe("safe");
      return d;
    });
    expect(errors).toEqual(["read"]);
    dispose();
  });

  test("reports a failing write", () => {
    const errors: string[] = [];
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    } as unknown as Storage;

    const [dispose, setValue] = createRoot((d) => {
      const [, write] = persisted("quota", 0, {
        storage: store,
        onError: (_e, phase) => errors.push(phase),
      });
      return [d, write] as const;
    });
    setValue(1);
    flush();
    expect(errors).toEqual(["write"]);
    dispose();
  });

  test("a failed write does not leave the mirror claiming it succeeded", () => {
    const errors: string[] = [];
    const held: Record<string, string> = {};
    let refuse = true;
    const store = {
      getItem: (k: string) => held[k] ?? null,
      setItem: (k: string, v: string) => {
        if (refuse) throw new Error("QuotaExceededError");
        held[k] = v;
      },
      removeItem: (k: string) => {
        delete held[k];
      },
    } as unknown as Storage;

    const [dispose, setValue] = createRoot((d) => {
      const [, write] = persisted("quota-retry", 0, {
        storage: store,
        onError: (_error, phase) => errors.push(phase),
      });
      return [d, write] as const;
    });
    setValue(1);
    flush();
    expect(errors).toEqual(["write"]);
    expect(held["quota-retry"]).toBeUndefined();

    refuse = false;
    setValue(2);
    flush();
    expect(held["quota-retry"]).toBe("2");
    dispose();
  });

  test("a custom codec round-trips", () => {
    const [dispose, setValue] = createRoot((d) => {
      const [, write] = persisted("raw", "a", {
        serialize: (v) => v,
        deserialize: (v) => v,
      });
      return [d, write] as const;
    });
    setValue("b");
    flush();
    expect(localStorage.getItem("raw")).toBe("b");
    dispose();
  });
});

describe("peekPersisted", () => {
  test("reads without a scope", () => {
    localStorage.setItem("peeked", "42");
    expect(peekPersisted("peeked", 0)).toBe(42);
    expect(peekPersisted("missing", 5)).toBe(5);
    localStorage.setItem("bad", "{");
    expect(peekPersisted("bad", "safe")).toBe("safe");
  });
});
