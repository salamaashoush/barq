import { describe, expect, test } from "bun:test";
import {
  action,
  createEffect,
  createRoot,
  createSignal,
  createTrackedEffect,
  flush,
  onSettled,
} from "@barqjs/core";
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
    const [dispose, m] = createRoot((d) => [d, fetcher()] as const);
    expect(m.state()).toBe("idle");
    expect(m.send("RESOLVED")).toBe(false);
    expect(m.state()).toBe("idle");
    expect(m.send("FETCH")).toBe(true);
    flush();
    expect(m.state()).toBe("loading");
    dispose();
  });

  test("an action folds the payload into the context", () => {
    const [dispose, m] = createRoot((d) => [d, fetcher()] as const);
    m.send("FETCH");
    m.send("RESOLVED", "the body");
    flush();
    expect(m.state()).toBe("ready");
    expect(m.context().last).toBe("the body");
    dispose();
  });

  test("a guard refuses without moving", () => {
    const [dispose, m] = createRoot((d) => [d, fetcher()] as const);
    for (let i = 0; i < 2; i++) {
      m.send("FETCH");
      m.send("REJECTED");
    }
    flush();
    expect(m.context().tries).toBe(2);
    expect(m.state()).toBe("failed");
    // The guard is `tries < 2`, and it is now 2.
    expect(m.can("FETCH")).toBe(false);
    expect(m.send("FETCH")).toBe(false);
    flush();
    expect(m.state()).toBe("failed");

    expect(m.send("RESET")).toBe(true);
    flush();
    expect(m.state()).toBe("idle");
    dispose();
  });

  test("state is reactive", () => {
    const seen: string[] = [];
    const [dispose, m] = createRoot((d) => {
      const instance = fetcher();
      createTrackedEffect(() => {
        seen.push(instance.state());
      });
      return [d, instance] as const;
    });
    flush();
    m.send("FETCH");
    flush();
    m.send("RESOLVED", "x");
    flush();
    expect(seen).toEqual(["idle", "loading", "ready"]);
    dispose();
  });

  test("enter runs for the initial state and its cleanup runs on leaving", () => {
    const log: string[] = [];
    const [dispose, m] = createRoot((d) => {
      const instance = machine<"a" | "b", "GO" | "BACK">({
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
      return [d, instance] as const;
    });
    m.send("GO");
    expect(log).toEqual(["enter:a", "exit:a", "enter:b"]);

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
    const [dispose, built] = createRoot((d) => {
      const m: { send?: (e: "GO" | "DONE") => boolean } = {};
      const instance = machine<"a" | "b" | "c", "GO" | "DONE">({
        initial: "a",
        states: {
          a: { on: { GO: "b" } },
          b: {
            on: { DONE: "c" },
            enter: () => {
              flush();
              seen.push(instance.state());
              m.send?.("DONE");
            },
          },
          c: {},
        },
      });
      m.send = instance.send;
      return [d, instance] as const;
    });
    built.send("GO");
    expect(seen).toEqual(["b"]);
    flush();
    expect(built.state()).toBe("c");
    dispose();
  });

  test("a send from onSettled moves the machine", () => {
    const [dispose, m] = createRoot((d) => {
      const instance = fetcher();
      onSettled(() => {
        instance.send("FETCH");
      });
      return [d, instance] as const;
    });
    flush();
    expect(m.state()).toBe("loading");
    dispose();
  });

  test("a send from an effect moves the machine", () => {
    const [wanted, setWanted] = createSignal(false);
    const [resolved, setResolved] = createSignal(false);
    const [dispose, m] = createRoot((d) => {
      const instance = fetcher();
      createTrackedEffect(() => {
        if (wanted()) instance.send("FETCH");
      });
      createEffect(resolved, (done) => {
        if (done) instance.send("RESOLVED", "the body");
      });
      return [d, instance] as const;
    });
    flush();
    setWanted(true);
    flush();
    expect(m.state()).toBe("loading");
    setResolved(true);
    flush();
    expect(m.state()).toBe("ready");
    expect(m.context().last).toBe("the body");
    dispose();
  });

  test("a send from an action lands when the action settles", async () => {
    const [dispose, m] = createRoot((d) => [d, fetcher()] as const);
    const load = action(function* () {
      m.send("FETCH");
      const body: string = yield Promise.resolve("the body");
      m.send("RESOLVED", body);
    });
    await load();
    flush();
    expect(m.state()).toBe("ready");
    expect(m.context().last).toBe("the body");
    dispose();
  });

  test("matches narrows without reading the raw string", () => {
    const dispose = createRoot((d) => {
      const m = fetcher();
      expect(m.matches("idle")).toBe(true);
      expect(m.matches("ready")).toBe(false);
      return d;
    });
    dispose();
  });
});
