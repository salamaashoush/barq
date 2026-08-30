import { describe, expect, test } from "bun:test";
import { effect, flush, root } from "@barqjs/core";
import { machine } from "./machine.ts";

type State = "idle" | "loading" | "ready" | "failed";
type Event = "FETCH" | "RESOLVED" | "REJECTED" | "RESET";

const fetcher = () =>
  machine<State, Event, { tries: number; last: string }>({
    initial: "idle",
    context: { tries: 0, last: "" },
    states: {
      idle: { on: { FETCH: "loading" } },
      loading: {
        on: {
          RESOLVED: { to: "ready", action: (c, payload) => ({ ...c, last: String(payload) }) },
          REJECTED: { to: "failed", action: (c) => ({ ...c, tries: c.tries + 1 }) },
        },
      },
      ready: { on: { FETCH: "loading", RESET: "idle" } },
      failed: {
        on: {
          FETCH: { to: "loading", guard: (c) => c.tries < 2 },
          RESET: "idle",
        },
      },
    },
  });

describe("machine", () => {
  test("moves on a handled event and ignores an unhandled one", () => {
    const dispose = root((d) => {
      const m = fetcher();
      expect(m.state()).toBe("idle");
      expect(m.send("RESOLVED")).toBe(false);
      expect(m.state()).toBe("idle");
      expect(m.send("FETCH")).toBe(true);
      expect(m.state()).toBe("loading");
      return d;
    });
    dispose();
  });

  test("an action folds the payload into the context", () => {
    const dispose = root((d) => {
      const m = fetcher();
      m.send("FETCH");
      m.send("RESOLVED", "the body");
      expect(m.state()).toBe("ready");
      expect(m.context().last).toBe("the body");
      return d;
    });
    dispose();
  });

  test("a guard refuses without moving", () => {
    const dispose = root((d) => {
      const m = fetcher();
      for (let i = 0; i < 2; i++) {
        m.send("FETCH");
        m.send("REJECTED");
      }
      expect(m.context().tries).toBe(2);
      expect(m.state()).toBe("failed");
      // The guard is `tries < 2`, and it is now 2.
      expect(m.can("FETCH")).toBe(false);
      expect(m.send("FETCH")).toBe(false);
      expect(m.state()).toBe("failed");

      expect(m.send("RESET")).toBe(true);
      expect(m.state()).toBe("idle");
      return d;
    });
    dispose();
  });

  test("state is reactive", () => {
    const seen: string[] = [];
    const dispose = root((d) => {
      const m = fetcher();
      effect(() => seen.push(m.state()));
      m.send("FETCH");
      flush();
      m.send("RESOLVED", "x");
      flush();
      return d;
    });
    expect(seen).toEqual(["idle", "loading", "ready"]);
    dispose();
  });

  test("enter runs for the initial state and its cleanup runs on leaving", () => {
    const log: string[] = [];
    const dispose = root((d) => {
      const m = machine<"a" | "b", "GO" | "BACK">({
        initial: "a",
        states: {
          a: {
            on: { GO: "b" },
            enter: () => {
              log.push("enter:a");
              return () => log.push("exit:a");
            },
          },
          b: {
            on: { BACK: "a" },
            enter: () => {
              log.push("enter:b");
              return () => log.push("exit:b");
            },
          },
        },
      });
      expect(log).toEqual(["enter:a"]);
      m.send("GO");
      expect(log).toEqual(["enter:a", "exit:a", "enter:b"]);
      return d;
    });

    dispose();
    expect(log, "the live state's cleanup did not run on disposal").toEqual([
      "enter:a",
      "exit:a",
      "enter:b",
      "exit:b",
    ]);
  });

  test("an enter that sends sees the state it was entered for", () => {
    const seen: string[] = [];
    const dispose = root((d) => {
      const m: { send?: (e: "GO" | "DONE") => boolean } = {};
      const built = machine<"a" | "b" | "c", "GO" | "DONE">({
        initial: "a",
        states: {
          a: { on: { GO: "b" } },
          b: {
            on: { DONE: "c" },
            enter: () => {
              seen.push(built.state());
              m.send?.("DONE");
            },
          },
          c: {},
        },
      });
      m.send = built.send;
      built.send("GO");
      expect(seen).toEqual(["b"]);
      expect(built.state()).toBe("c");
      return d;
    });
    dispose();
  });

  test("matches narrows without reading the raw string", () => {
    const dispose = root((d) => {
      const m = fetcher();
      expect(m.matches("idle")).toBe(true);
      expect(m.matches("ready")).toBe(false);
      return d;
    });
    dispose();
  });
});
