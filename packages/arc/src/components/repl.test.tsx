import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  Repl,
  type ReplHandle,
  type ReplOutput,
  type ReplProps,
  bracketsBalanced,
} from "./repl.tsx";

function field(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Code to run" });
}

function typeIn(text: string): void {
  const input = field();
  input.focus();
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function outputs(): string[] {
  return [...document.querySelectorAll('[data-slot="repl-output"]')].map(
    (one) => `${one.getAttribute("data-kind")}:${one.textContent ?? ""}`,
  );
}

function echoes(): string[] {
  return [...document.querySelectorAll('[data-slot="repl-code"]')].map(
    (one) => one.textContent ?? "",
  );
}

function evaluate(text: string): ReplOutput {
  return { kind: "result", text: `= ${text}` };
}

async function flushRun(): Promise<void> {
  for (let round = 0; round < 4; round++) await settle();
}

afterEach(() => localStorage.clear());

describe("bracketsBalanced", () => {
  test("open brackets and strings ask for another line", () => {
    expect(bracketsBalanced("let a = 1")).toBe(true);
    expect(bracketsBalanced("fn(a, [1, 2")).toBe(false);
    expect(bracketsBalanced("{ a: (1) }")).toBe(true);
    expect(bracketsBalanced('"(" + x')).toBe(true);
    expect(bracketsBalanced('"open')).toBe(false);
    expect(bracketsBalanced("`multi\nline")).toBe(false);
    expect(bracketsBalanced('"a\\"b"')).toBe(true);
    expect(bracketsBalanced(")")).toBe(true);
  });
});

describe("Repl", () => {
  test("Enter runs a whole input and prints its result under it", async () => {
    render(() => <Repl onSubmit={(text) => evaluate(text)} />);
    expect(screen.getByRole("log", { name: "Console" })).toBeDefined();
    expect(screen.getByText("Type code and press Enter to run it.")).toBeDefined();
    typeIn("1 + 2");
    await user.keyboard("{Enter}");
    await flushRun();
    expect(echoes()).toEqual(["1 + 2"]);
    expect(outputs()).toEqual(["result:= 1 + 2"]);
    expect(field().value).toBe("");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("an open bracket keeps Enter for a new line; Shift+Enter always does", async () => {
    const ran: string[] = [];
    render(() => (
      <Repl
        onSubmit={(text) => {
          ran.push(text);
        }}
      />
    ));
    typeIn("fn(1,");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    field().dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    typeIn("a");
    const shifted = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    field().dispatchEvent(shifted);
    expect(shifted.defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
    typeIn("fn(1,\n2)");
    await user.keyboard("{Enter}");
    await flushRun();
    expect(ran).toEqual(["fn(1,\n2)"]);
  });

  test("a custom isComplete decides", async () => {
    const ran: string[] = [];
    render(() => (
      <Repl
        isComplete={(text) => text.endsWith(";")}
        onSubmit={(text) => {
          ran.push(text);
        }}
      />
    ));
    typeIn("let a = 1");
    await user.keyboard("{Enter}");
    expect(ran).toEqual([]);
    typeIn("let a = 1;");
    await user.keyboard("{Enter}");
    await flushRun();
    expect(ran).toEqual(["let a = 1;"]);
  });

  test("Up and Down walk the history and come back to the draft", async () => {
    render(() => <Repl history={["one", "two"]} onSubmit={(text) => evaluate(text)} />);
    typeIn("draft");
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(field().value).toBe("two");
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(field().value).toBe("one");
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(field().value).toBe("one");
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(field().value).toBe("two");
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(field().value).toBe("draft");
  });

  test("with storageKey the history survives the next visit", async () => {
    const first = render(() => <Repl storageKey="toy" onSubmit={(text) => evaluate(text)} />);
    typeIn("remembered");
    await user.keyboard("{Enter}");
    await flushRun();
    first.unmount();
    render(() => <Repl storageKey="toy" onSubmit={(text) => evaluate(text)} />);
    field().focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(field().value).toBe("remembered");
  });

  test("streamed output arrives as it comes, joined by kind, with ANSI colours", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* run(): AsyncGenerator<ReplOutput> {
      yield { kind: "stdout", text: "Hel" };
      yield { kind: "stdout", text: "lo\n" };
      await gate;
      yield { kind: "stderr", text: "\u001b[33mwarn\u001b[0m" };
      yield { kind: "result", text: "42" };
    }
    render(() => <Repl onSubmit={() => run()} />);
    typeIn("go");
    await user.keyboard("{Enter}");
    await flushRun();
    expect(outputs()).toEqual(["stdout:Hello"]);
    expect(document.querySelector('[data-slot="repl-running"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined();
    release();
    await flushRun();
    expect(outputs()).toEqual(["stdout:Hello", "stderr:Error output: warn", "result:42"]);
    expect(document.querySelector('[data-ansi="yellow"]')?.textContent).toBe("warn");
    expect(document.querySelector('[data-slot="repl-running"]')).toBeNull();
  });

  test("Stop and Ctrl+C abort the run through its signal", async () => {
    const signals: AbortSignal[] = [];
    function hang(_text: string, signal: AbortSignal): Promise<void> {
      signals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    render(() => <Repl onSubmit={hang} />);
    typeIn("loop");
    await user.keyboard("{Enter}");
    await flushRun();
    user.click(screen.getByRole("button", { name: "Stop" }));
    await flushRun();
    expect(signals[0]?.aborted).toBe(true);
    expect(screen.getByText("Stopped")).toBeDefined();
    typeIn("loop");
    await user.keyboard("{Enter}");
    await flushRun();
    field().focus();
    user.keyboard("c", { ctrlKey: true });
    await flushRun();
    expect(signals[1]?.aborted).toBe(true);
  });

  test("a thrown error is printed as an error", async () => {
    render(() => (
      <Repl
        onSubmit={() => {
          throw new Error("unknown name x");
        }}
      />
    ));
    typeIn("x");
    await user.keyboard("{Enter}");
    await flushRun();
    expect(outputs()).toEqual(["error:Error: unknown name x"]);
    expect(document.querySelector('[data-slot="repl-entry"]')?.getAttribute("data-status")).toBe(
      "failed",
    );
  });

  test("Clear and Ctrl+L empty the transcript; copy holds prompts and output", async () => {
    let handle: ReplHandle | undefined;
    render(() => (
      <Repl
        onSubmit={(text) => [{ kind: "stdout", text: `\u001b[1m${text}\u001b[0m` }]}
        handle={(given) => {
          handle = given;
        }}
      />
    ));
    typeIn("a\n");
    await user.keyboard("{Enter}");
    await flushRun();
    handle?.print({ kind: "info", text: "reloaded" });
    await settle();
    expect(outputs()).toEqual(["stdout:a\n", "info:Note: reloaded"]);
    user.click(screen.getByRole("button", { name: "Clear" }));
    await settle();
    expect(outputs()).toEqual([]);
    handle?.run("b");
    await flushRun();
    expect(echoes()).toEqual(["b"]);
    field().focus();
    user.keyboard("l", { ctrlKey: true });
    await settle();
    expect(echoes()).toEqual([]);
  });

  test("an input highlighted by its language", async () => {
    render(() => <Repl language="json" onSubmit={(text) => evaluate(text)} />);
    typeIn('{"a": 1}');
    await user.keyboard("{Enter}");
    await flushRun();
    expect(document.querySelector('[data-slot="repl-code"] [class^="tok-"]')).not.toBeNull();
  });

  test("disabled runs nothing", async () => {
    const ran: string[] = [];
    render(() => (
      <Repl
        isDisabled
        onSubmit={(text) => {
          ran.push(text);
        }}
      />
    ));
    expect(field().disabled).toBe(true);
    expect(
      screen
        .getByRole<HTMLButtonElement>("button", { name: "Run" })
        .getAttribute("aria-disabled") ??
        screen.getByRole<HTMLButtonElement>("button", { name: "Run" }).disabled,
    ).toBeTruthy();
    expect(ran).toEqual([]);
  });

  test("a custom field gets the REPL's keys", async () => {
    const ran: string[] = [];
    render(() => (
      <Repl
        history={["older"]}
        onSubmit={(text) => {
          ran.push(text);
        }}
        input={(input) => (
          <input
            aria-label={input.label}
            id={input.id}
            value={input.value()}
            onInput={(event: InputEvent) =>
              input.setValue((event.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(event: KeyboardEvent) => {
              input.keyDown(event, { onFirstLine: true, onLastLine: true });
            }}
          />
        )}
      />
    ));
    const custom = screen.getByRole<HTMLInputElement>("textbox", { name: "Code to run" });
    custom.focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(custom.value).toBe("older");
    await user.keyboard("{Enter}");
    await flushRun();
    expect(ran).toEqual(["older"]);
  });

  test("right to left, code stays left to right", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Repl aria-label="وحدة التحكم" onSubmit={(text) => evaluate(text)} />
      </Arabic>
    ));
    expect(field().getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("log", { name: "وحدة التحكم" })).toBeDefined();
  });

  test("takes a class per part", () => {
    const props: ReplProps = {
      onSubmit: (text) => evaluate(text),
      class: "mine",
      classes: { root: "r", transcript: "t", input: "i", toolbar: "b" },
    };
    render(() => <Repl {...props} />);
    const pairs = [
      ["repl", "r"],
      ["repl-transcript", "t"],
      ["repl-input", "i"],
      ["repl-toolbar", "b"],
    ] as const;
    for (const [name, cls] of pairs) {
      expect(document.querySelector(`[data-slot="${name}"]`)?.classList.contains(cls)).toBe(true);
    }
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Repl } from "<arc>";
      export function Page() {
        return <Repl banner="toy 1.0" history={["1 + 1"]} onSubmit={(text) => ({ kind: "result", text })} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="repl-banner"]')?.textContent).toBe(
      "toy 1.0",
    );
    result.unmount();
  });
});
