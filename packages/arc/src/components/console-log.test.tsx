import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ConsoleLogView, type LogEntry, ansiSegments, stripAnsi } from "./console-log.tsx";

const ESC = String.fromCharCode(27);

const ENTRIES: LogEntry[] = [
  { id: "1", level: "error", time: 1250, source: "page", text: "TypeError: total is undefined" },
  { id: "2", level: "log", time: 1310, source: "script", text: '{"status":200,"ok":true}' },
  { id: "3", level: "warn", time: 1400, source: "page", text: "Slow response: 2.1 s" },
  {
    id: "4",
    level: "info",
    time: 1500,
    source: "script",
    text: `${ESC}[32mpassed${ESC}[0m 3 tests`,
  },
  { id: "5", level: "debug", time: 1600, source: "script", text: "fill <secret>PASSWORD</secret>" },
];

const written: string[] = [];
const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  written.length = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string): Promise<void> => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(navigator, "clipboard");
  else Object.defineProperty(navigator, "clipboard", original);
});

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function lines(): string[] {
  return [...document.querySelectorAll('[data-slot="console-log-message"]')].map(
    (one) => one.textContent ?? "",
  );
}

describe("ANSI", () => {
  test("cuts a line into styled runs and drops other escapes", () => {
    expect(ansiSegments(`${ESC}[1;31mfail${ESC}[0m ok ${ESC}[2K${ESC}[94mnote${ESC}[39m.`)).toEqual(
      [
        { text: "fail", bold: true, colour: "red" },
        { text: " ok " },
        { text: "note", colour: "bright-blue" },
        { text: ".", colour: undefined },
      ],
    );
    expect(stripAnsi(`${ESC}[32mpassed${ESC}[0m`)).toBe("passed");
  });
});

describe("ConsoleLogView", () => {
  test("levelled lines with time, level in words and source, a JSON line opened in place", async () => {
    render(() => (
      <ConsoleLogView
        entries={ENTRIES}
        redaction={/<secret>(\w+)<\/secret>/g}
        aria-label="Console"
      />
    ));
    await settle();
    const log = screen.getByRole("log", { name: "Console" });
    expect(log.getAttribute("aria-live")).toBe("off");
    expect(log.getAttribute("tabindex")).toBe("0");
    const rows = [...document.querySelectorAll('[data-slot="console-log-line"]')];
    expect(rows.map((one) => one.getAttribute("data-level"))).toEqual([
      "error",
      "log",
      "warn",
      "info",
      "debug",
    ]);
    expect(rows[0]?.querySelector('[data-slot="console-log-level"]')?.textContent).toBe("error");
    expect(rows[0]?.querySelector('[data-slot="console-log-time"]')?.textContent).toBe("1.250s");
    expect(rows[0]?.querySelector('[data-slot="console-log-source"]')?.textContent).toBe("page");
    expect(rows[3]?.querySelector('[data-ansi="green"]')?.textContent).toBe("passed");
    expect(rows[4]?.textContent).toContain("PASSWORD");
    expect(rows[4]?.textContent).not.toContain("<secret>");

    const expand = screen.getByRole("button", { name: "Show formatted" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    await user.click(expand);
    flush();
    const json = document.querySelector('[data-slot="console-log-json"]');
    expect(json?.textContent).toBe('{\n  "status": 200,\n  "ok": true\n}');
    expect(json?.querySelector(".tok-number")?.textContent).toBe("200");
    expect(
      screen.getByRole("button", { name: "Hide formatted" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("filters by level and by text, says how many match, and copies what is shown", async () => {
    const levels: string[][] = [];
    render(() => <ConsoleLogView entries={ENTRIES} onLevelsChange={(next) => levels.push(next)} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "debug 1" }));
    await user.click(screen.getByRole("button", { name: "log 1" }));
    flush();
    expect(levels.at(-1)).toEqual(["error", "warn", "info"]);
    expect(lines()).toEqual([
      "TypeError: total is undefined",
      "Slow response: 2.1 s",
      "passed 3 tests",
    ]);

    await user.type(screen.getByRole("searchbox", { name: "Search the log" }), "PASSED");
    flush();
    expect(lines()).toEqual(["passed 3 tests"]);
    expect(document.querySelector('[data-slot="console-log-status"]')?.textContent).toBe(
      "1 line matches",
    );

    await user.click(screen.getByRole("button", { name: "Copy the log" }));
    await tick();
    expect(written).toEqual(["1500 info script passed 3 tests"]);

    await user.clear(screen.getByRole("searchbox", { name: "Search the log" }));
    await user.type(screen.getByRole("searchbox", { name: "Search the log" }), "nothing like it");
    flush();
    expect(screen.getByText("No lines match")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    flush();
    expect(lines().length).toBe(5);
  });

  test("a live log follows its newest line until the reader scrolls up", async () => {
    const [entries, setEntries] = createSignal<LogEntry[]>(ENTRIES.slice(0, 2));
    const following: boolean[] = [];
    render(() => (
      <ConsoleLogView
        entries={entries()}
        live
        aria-label="Worker log"
        onFollowChange={(on) => following.push(on)}
      />
    ));
    await settle();
    const log = screen.getByRole("log", { name: "Worker log" });
    expect(log.getAttribute("aria-live")).toBe("polite");
    const follow = screen.getByRole("button", { name: "Follow" });
    expect(follow.getAttribute("aria-pressed")).toBe("true");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 300 });
    setEntries(ENTRIES);
    flush();
    await tick();
    expect(log.scrollTop).toBe(900);

    log.scrollTop = 100;
    log.dispatchEvent(new Event("scroll"));
    flush();
    expect(following).toEqual([false]);
    expect(follow.getAttribute("aria-pressed")).toBe("false");
    await user.click(screen.getByRole("button", { name: "Jump to the latest" }));
    flush();
    expect(following).toEqual([false, true]);
  });

  test("a log that goes live starts following", async () => {
    const [live, setLive] = createSignal(false);
    render(() => <ConsoleLogView entries={ENTRIES} live={live()} aria-label="Stream" />);
    await settle();
    const follow = screen.getByRole("button", { name: "Follow" });
    expect(follow.getAttribute("aria-pressed")).toBe("false");
    setLive(true);
    flush();
    await settle();
    expect(follow.getAttribute("aria-pressed")).toBe("true");
  });

  test("a long log draws only the lines in view", async () => {
    const many: LogEntry[] = Array.from({ length: 5000 }, (_, at) => ({
      id: String(at),
      text: `line ${String(at)}`,
    }));
    render(() => <ConsoleLogView entries={many} toolbar={false} height={400} />);
    await settle();
    const drawn = document.querySelectorAll('[data-slot="console-log-line"]').length;
    expect(drawn).toBeGreaterThan(10);
    expect(drawn).toBeLessThan(100);
    expect(lines()[0]).toBe("line 0");
    expect(document.querySelector('[data-slot="console-log"]')?.getAttribute("style")).toContain(
      "--log-height: 400px",
    );
  });

  test("says when it is empty, still loading, or could not be read", () => {
    const { unmount } = render(() => <ConsoleLogView entries={[]} />);
    expect(screen.getByText("Nothing logged")).toBeDefined();
    unmount();
    const loading = render(() => <ConsoleLogView entries={[]} isLoading />);
    expect(screen.getByText("Loading the log…")).toBeDefined();
    expect(document.querySelector('[data-slot="console-log"]')?.getAttribute("aria-busy")).toBe(
      "true",
    );
    loading.unmount();
    render(() => <ConsoleLogView entries={[]} errorMessage="The run kept no console." />);
    expect(screen.getByRole("alert").textContent).toBe("The run kept no console.");
  });

  test("lines stay left to right on a right-to-left page, clock times written for the reader", async () => {
    render(() => (
      <Rtl>
        <ConsoleLogView
          entries={[{ level: "log", time: "2026-11-26T09:30:05.120Z", text: "ready" }]}
          aria-label="السجل"
        />
      </Rtl>
    ));
    await settle();
    expect(document.querySelector('[data-slot="console-log-message"]')?.getAttribute("dir")).toBe(
      "ltr",
    );
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-11-26T09:30:05.120Z",
    );
    expect(screen.getByRole("log", { name: "السجل" })).toBeDefined();
  });

  test("is hydrated in place", async () => {
    const result = await hydrates(`
      import { ConsoleLogView } from "<arc>";
      const entries = [
        { id: "a", level: "error", time: 10, source: "page", text: "boom" },
        { id: "b", level: "log", time: 20, source: "script", text: '{"a":1}' },
        { id: "c", level: "info", time: "2026-11-26T09:30:05.120Z", text: "\\u001b[32mok\\u001b[0m" },
      ];
      export function Page() {
        return <ConsoleLogView entries={entries} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="console-log-line"]').length).toBe(3);
    result.unmount();
  });
});
