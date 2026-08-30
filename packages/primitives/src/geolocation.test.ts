import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { root } from "@barqjs/core";
import { geolocation } from "./geolocation.ts";

type Success = (reading: unknown) => void;
type Failure = (error: unknown) => void;

const calls: { success: Success; failure: Failure; kind: "once" | "watch"; id: number }[] = [];

/** The shape the API rejects with, with the constants the interface requires. */
const denied = (code: number, message: string): GeolocationPositionError => ({
  code,
  message,
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
});
let cleared: number[] = [];
let nextId = 1;
const real = navigator.geolocation;

const reading = (latitude: number) => ({
  coords: { latitude, longitude: 2, accuracy: 5, altitude: null, heading: null, speed: null },
  timestamp: 1000,
});

beforeEach(() => {
  calls.length = 0;
  cleared = [];
  nextId = 1;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: Success, failure: Failure) => {
        calls.push({ success, failure, kind: "once", id: 0 });
      },
      watchPosition: (success: Success, failure: Failure) => {
        const id = nextId++;
        calls.push({ success, failure, kind: "watch", id });
        return id;
      },
      clearWatch: (id: number) => cleared.push(id),
    },
  });
});

afterEach(() => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: real });
});

describe("geolocation", () => {
  test("asks for nothing until told to", () => {
    const dispose = root((d) => {
      const where = geolocation();
      expect(where.position()).toBeUndefined();
      expect(where.watching()).toBe(false);
      return d;
    });
    // No prompt was raised by merely creating it.
    expect(calls).toHaveLength(0);
    dispose();
  });

  test("locate resolves with a flattened fix", async () => {
    const dispose = root((d) => {
      const where = geolocation();
      return [d, where] as const;
    });

    const pending = dispose[1].locate();
    calls[0]!.success(reading(51.5));
    const found = await pending;

    expect(found.latitude).toBe(51.5);
    expect(found.accuracy).toBe(5);
    expect(found.timestamp).toBe(1000);
    expect(dispose[1].position()?.latitude).toBe(51.5);
    dispose[0]();
  });

  test("a denial is reported, not swallowed", async () => {
    const dispose = root((d) => {
      const where = geolocation();
      return [d, where] as const;
    });

    const pending = dispose[1].locate();
    const denial = denied(1, "User denied Geolocation");
    calls[0]!.failure(denial);

    await expect(pending).rejects.toEqual(denial);
    expect(dispose[1].error()).toEqual(denial);
    expect(dispose[1].position()).toBeUndefined();
    dispose[0]();
  });

  test("a watch publishes each fix and clears with its owner", () => {
    const dispose = root((d) => {
      const where = geolocation();
      where.start();
      expect(where.watching()).toBe(true);
      calls[0]!.success(reading(1));
      expect(where.position()?.latitude).toBe(1);
      calls[0]!.success(reading(2));
      expect(where.position()?.latitude).toBe(2);
      return d;
    });

    dispose();
    expect(cleared, "the watch outlived its owner").toEqual([1]);
  });

  test("start twice does not open a second watch", () => {
    const dispose = root((d) => {
      const where = geolocation();
      where.start();
      where.start();
      where.start();
      return d;
    });
    expect(calls.filter((c) => c.kind === "watch")).toHaveLength(1);
    dispose();
  });

  test("stop ends the watch and can be repeated", () => {
    const dispose = root((d) => {
      const where = geolocation();
      where.start();
      where.stop();
      where.stop();
      expect(where.watching()).toBe(false);
      return d;
    });
    expect(cleared).toEqual([1]);
    dispose();
  });

  test("a later fix clears an earlier error", () => {
    const dispose = root((d) => {
      const where = geolocation();
      where.start();
      calls[0]!.failure(denied(2, "position unavailable"));
      expect(where.error()).toBeDefined();
      calls[0]!.success(reading(9));
      expect(where.error()).toBeUndefined();
      expect(where.position()?.latitude).toBe(9);
      return d;
    });
    dispose();
  });
});
