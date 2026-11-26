import {
  type Child,
  For,
  type Signal,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Eraser } from "@barqjs/lucide/icons/eraser";
import { Play } from "@barqjs/lucide/icons/play";
import { Square } from "@barqjs/lucide/icons/square";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { persisted } from "@barqjs/primitives/storage";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";

import { lightHighlightLines } from "../code/light-highlight.ts";
import { codeSurface } from "../code/style.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  edge,
  fg,
  focus,
  gap,
  layout,
  place,
  space,
  surface,
  truncate,
  type,
} from "../style/index.ts";
import { AnsiText, ansiColours, stripAnsi } from "./console-log.tsx";
import { CopyButton } from "./copy-button.tsx";
import { IconButton } from "./icon-button.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";

export type ReplOutputKind = "result" | "stdout" | "stderr" | "error" | "info";

/** One piece of what a run printed or returned. ANSI style codes in `text` are drawn. */
export interface ReplOutput {
  kind: ReplOutputKind;
  text: string;
}

/**
 * What `onSubmit` answers with: outputs streamed as they come, all of them at
 * once, or nothing, now or later.
 */
export type ReplReply =
  | AsyncIterable<ReplOutput>
  | Iterable<ReplOutput>
  | ReplOutput
  | void
  | Promise<Iterable<ReplOutput> | ReplOutput | void>;

export type ReplEntryStatus = "running" | "done" | "failed" | "stopped";

/** One input and what it produced. */
export interface ReplEntry {
  id: string;
  input: string;
  outputs: readonly ReplOutput[];
  status: ReplEntryStatus;
}

/** What the input hands a custom field (`input`) so it behaves as the built-in one. */
export interface ReplInputField {
  value: () => string;
  setValue: (text: string) => void;
  /** Runs the text, when it is complete and nothing is running. */
  submit: () => void;
  /**
   * The REPL's keys for a field that is not a textarea: Enter runs or adds a
   * line, Up and Down walk the history at the first and last line. `true`
   * when it handled the key.
   */
  keyDown: (event: KeyboardEvent, caret: ReplCaret) => boolean;
  /** Names the field. */
  label: string;
  /** The field's id, which the prompt labels. */
  id: string;
  running: () => boolean;
}

/** Where the caret is, for `keyDown`. */
export interface ReplCaret {
  onFirstLine: boolean;
  onLastLine: boolean;
}

/** What a caller holding the REPL can do to it. */
export interface ReplHandle {
  /** Runs `text` as though it was typed and Enter pressed. */
  run(text: string): void;
  /** Adds outputs to the transcript that no input produced: a start-up banner, a reload. */
  print(...outputs: ReplOutput[]): void;
  clear(): void;
  /** Stops the run in progress. */
  stop(): void;
  focus(): void;
}

const codePad = arc({ paddingBlock: "var(--code-pad-y)", paddingInline: "var(--code-pad-x)" });

export const replStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, layout.clip, surface.bordered, surface.sunken, {
      "&[data-fill]": { height: "100%" },
    }),
    toolbar: arc(layout.row, gap[1], edge.bottom, place.paddedStrip),
    title: arc(type.label, fg.muted, layout.grow, truncate),
    transcript: arc(
      codeSurface,
      ansiColours,
      focus.outline,
      layout.column,
      layout.scrollBlock,
      codePad,
      {
        height: "var(--repl-height, 18rem)",
        maxHeight: "var(--repl-max-height, none)",
        "[data-fill] > &": { flex: "1 1 0", height: "auto", minHeight: "0px" },
      },
    ),
    entry: arc(layout.column, { paddingBlock: space.x0_5 }),
    echo: arc(layout.row, gap[2], { alignItems: "flex-start" }),
    prompt: arc(layout.noShrink, fg.muted, { userSelect: "none" }),
    code: arc(type.written, { minWidth: "0px" }),
    output: arc(type.written, {
      "&[data-kind=result]": { color: "var(--code-function)" },
      "&[data-kind=stderr]": { color: "var(--warning-foreground)" },
      "&[data-kind=error]": { color: "var(--danger-foreground)" },
    }),
    info: arc(fg.muted, { fontStyle: "italic" }),
    status: arc(layout.row, gap[2], fg.muted, type.meta),
    empty: arc(fg.muted, type.meta),
    form: arc(codeSurface, layout.row, gap[2], edge.top, focus.within, codePad, {
      alignItems: "flex-start",
    }),
    input: arc(control.bareInput, layout.clip, { resize: "none" }),
  },
});

type Slots = ReturnType<typeof replStyles>;

export interface ReplProps extends Customisable<Slots> {
  /**
   * Runs one input. Return outputs as they arrive (an async iterable), all
   * at once, or a promise of them; throw to report an error. `signal`
   * aborts when the reader stops the run.
   */
  onSubmit: (text: string, signal: AbortSignal) => ReplReply;
  /**
   * Whether `text` is a whole input: Enter runs it, or adds a line while it
   * is not. @default brackets and quotes balanced, `bracketsBalanced`
   */
  isComplete?: (text: string) => boolean;
  /** Names the REPL. @default "Console" */
  "aria-label"?: string;
  /** Before each input. @default ">" */
  prompt?: string;
  /** Before each further line of an input. @default "." repeated to the prompt's width */
  continuationPrompt?: string;
  /** Highlights each input in the transcript, by a light highlighter's language name. */
  language?: string;
  /** Inputs to start the history with, oldest first. */
  history?: readonly string[];
  /** Keeps the history across visits under this name. */
  storageKey?: string;
  /** @default 200 */
  historyLimit?: number;
  /** At the top of the transcript: what the REPL runs, a version. */
  banner?: Child;
  /** Shown while the transcript is empty. @default "Type code and press Enter to run it." */
  placeholder?: string;
  /** Nothing runs: the toolchain is still loading. */
  isDisabled?: boolean;
  /** The field the input is typed in, for an editor in place of the textarea. */
  input?: (field: ReplInputField) => Child;
  /** The transcript's height, a CSS length or pixels. @default 18rem */
  height?: string | number;
  /** Fill the height of what holds it, a split pane or a docked panel, the transcript taking what is left. */
  fill?: boolean;
  /** More buttons in the toolbar, before Run: run the open file, restart. */
  actions?: Child;
  /** Hears every entry as it changes. */
  onEntriesChange?: (entries: ReplEntry[]) => void;
  /** Hands over the `ReplHandle` once the REPL is built. */
  handle?: (handle: ReplHandle) => void;
  id?: string;
}

const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);
const QUOTES = new Set(['"', "'", "`"]);

/**
 * Whether every bracket in `text` is closed and no string is left open, so
 * Enter runs it rather than starting another line. Quotes escape with a
 * backslash; a closing bracket with nothing open counts as complete, for the
 * language to report.
 */
export function bracketsBalanced(text: string): boolean {
  const open: string[] = [];
  let quote: string | undefined;
  for (let at = 0; at < text.length; at++) {
    const char = text[at] as string;
    if (quote !== undefined) {
      if (char === "\\") at++;
      else if (char === quote) quote = undefined;
      else if (char === "\n" && quote !== "`") quote = undefined;
      continue;
    }
    if (QUOTES.has(char)) quote = char;
    else if (char in OPENERS) open.push(OPENERS[char] as string);
    else if (CLOSERS.has(char)) {
      if (open.at(-1) === char) open.pop();
      else return true;
    }
  }
  return open.length === 0 && quote === undefined;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<ReplOutput> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function isIterable(value: unknown): value is Iterable<ReplOutput> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

function isOutput(value: unknown): value is ReplOutput {
  return typeof value === "object" && value !== null && "kind" in value && "text" in value;
}

function cssLength(value: string | number): string {
  return typeof value === "number" ? `${String(value)}px` : value;
}

function kindName(kind: ReplOutputKind, messages: ArcMessages): string {
  switch (kind) {
    case "result":
      return messages.replResult;
    case "stderr":
      return messages.replStderr;
    case "error":
      return messages.replError;
    case "info":
      return messages.replInfo;
    default:
      return messages.replStdout;
  }
}

interface LiveEntry {
  id: string;
  input: string | undefined;
  outputs: Signal<readonly ReplOutput[]>;
  status: Signal<ReplEntryStatus>;
}

/**
 * Read, run, print: an input with a prompt over a transcript of what each
 * input printed and returned, for a language's toolchain in the page or in a
 * worker.
 *
 * ```tsx
 * <Repl
 *   storageKey="toy-repl"
 *   onSubmit={async function* (code, signal) {
 *     for await (const line of worker.run(code, { signal })) yield { kind: "stdout", text: line };
 *     yield { kind: "result", text: await worker.result() };
 *   }}
 * />
 * ```
 *
 * Enter runs the input once `isComplete` says it is whole and adds a line
 * while it is not (an open bracket, an open string); Shift+Enter always adds
 * a line. Up and Down walk the history from the first and last line, and the
 * history can be kept under `storageKey`. Output streams in as it arrives,
 * in its kind's colour, with ANSI colour codes drawn; Stop or Ctrl+C aborts
 * the run through its `AbortSignal`, Ctrl+L clears, and the whole transcript
 * copies as text. The transcript is a log, so a screen reader hears new
 * output politely. `input` swaps the textarea for an editor, `handle` gives
 * the app `run`, `print`, `clear`, `stop` and `focus`.
 */
export function Repl(props: ReplProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(replStyles(), props.classes);
  }
  function label(): string {
    return props["aria-label"] ?? messages().repl;
  }
  function prompt(): string {
    return props.prompt ?? ">";
  }
  function continuation(): string {
    return props.continuationPrompt ?? ".".repeat(Math.max(prompt().length, 1));
  }
  const fieldId = createUniqueId();
  const transcript = makeRef<HTMLDivElement>();
  const field = makeRef<HTMLTextAreaElement>();

  const start = untrack(() => [...(props.history ?? [])]);
  const key = untrack(() => props.storageKey);
  const [history, setHistory] =
    key === undefined
      ? createSignal<readonly string[]>(start, { ownedWrite: true })
      : persisted<readonly string[]>(`arc-repl:${key}`, start);

  const [value, setShownValue] = createSignal("", { ownedWrite: true });
  // Read by the keys at once, before the write above is flushed.
  let current = "";
  function setValue(text: string, typed = false): void {
    current = text;
    setShownValue(text);
    const element = typed ? null : field();
    if (element !== null && element.value !== text) {
      element.value = text;
      element.setSelectionRange(text.length, text.length);
    }
  }
  const [entries, setEntries] = createSignal<readonly LiveEntry[]>([], { ownedWrite: true });
  const [running, setRunning] = createSignal(false, { ownedWrite: true });
  let controller: AbortController | undefined;
  let recall = -1;
  let draft = "";
  let made = 0;

  function snapshot(): ReplEntry[] {
    return untrack(entries)
      .filter((one) => one.input !== undefined)
      .map((one) => ({
        id: one.id,
        input: one.input as string,
        outputs: one.outputs[0](),
        status: one.status[0](),
      }));
  }
  function told(): void {
    props.onEntriesChange?.(snapshot());
  }

  function newEntry(input: string | undefined, status: ReplEntryStatus): LiveEntry {
    made += 1;
    return {
      id: `entry-${String(made)}`,
      input,
      outputs: createSignal<readonly ReplOutput[]>([], { ownedWrite: true }),
      status: createSignal<ReplEntryStatus>(status, { ownedWrite: true }),
    };
  }

  function append(entry: LiveEntry, output: ReplOutput): void {
    const [outputs, setOutputs] = entry.outputs;
    const now = untrack(outputs);
    const last = now.at(-1);
    const streamed = output.kind === "stdout" || output.kind === "stderr";
    if (streamed && last !== undefined && last.kind === output.kind) {
      setOutputs([...now.slice(0, -1), { kind: last.kind, text: last.text + output.text }]);
    } else setOutputs([...now, output]);
  }

  function remember(text: string): void {
    const limit = untrack(() => props.historyLimit) ?? 200;
    const past = untrack(history).filter((one) => one !== text);
    setHistory([...past, text].slice(-limit));
  }

  async function settleReply(
    entry: LiveEntry,
    reply: ReplReply,
    signal: AbortSignal,
  ): Promise<void> {
    const resolved = await reply;
    if (isAsyncIterable(resolved)) {
      for await (const output of resolved) {
        if (signal.aborted) break;
        append(entry, output);
        told();
      }
    } else if (isOutput(resolved)) append(entry, resolved);
    else if (isIterable(resolved)) for (const output of resolved) append(entry, output);
  }

  async function execute(text: string): Promise<void> {
    const entry = newEntry(text, "running");
    setEntries([...untrack(entries), entry]);
    remember(text);
    recall = -1;
    draft = "";
    const own = new AbortController();
    controller = own;
    setRunning(true);
    told();
    try {
      await settleReply(entry, props.onSubmit(text, own.signal), own.signal);
      entry.status[1](own.signal.aborted ? "stopped" : "done");
    } catch (error) {
      if (own.signal.aborted) entry.status[1]("stopped");
      else {
        append(entry, {
          kind: "error",
          text: error instanceof Error ? error.message : String(error),
        });
        entry.status[1]("failed");
      }
    } finally {
      if (controller === own) controller = undefined;
      setRunning(false);
      told();
    }
  }

  function canRun(): boolean {
    return !untrack(running) && untrack(() => props.isDisabled) !== true;
  }
  function complete(text: string): boolean {
    return (untrack(() => props.isComplete) ?? bracketsBalanced)(text);
  }
  function submit(): void {
    const text = current;
    if (text.trim() === "" || !canRun() || !complete(text)) return;
    setValue("");
    void execute(text);
  }
  function stop(): void {
    controller?.abort();
  }
  function clear(): void {
    setEntries([]);
    told();
  }
  function walk(older: boolean): boolean {
    const past = untrack(history);
    if (past.length === 0) return false;
    if (recall === -1) {
      if (!older) return false;
      draft = current;
      recall = past.length - 1;
    } else if (older) {
      if (recall === 0) return true;
      recall -= 1;
    } else if (recall === past.length - 1) {
      recall = -1;
      setValue(draft);
      return true;
    } else recall += 1;
    setValue(past[recall] ?? "");
    return true;
  }

  function keyDown(event: KeyboardEvent, caret: ReplCaret): boolean {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      const text = current;
      if (!complete(text) && !event.ctrlKey && !event.metaKey) return false;
      event.preventDefault();
      submit();
      return true;
    }
    if (event.ctrlKey && !event.metaKey && (event.key === "c" || event.key === "C")) {
      if (!untrack(running)) return false;
      event.preventDefault();
      stop();
      return true;
    }
    if (event.ctrlKey && (event.key === "l" || event.key === "L")) {
      event.preventDefault();
      clear();
      return true;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.key === "ArrowUp" && caret.onFirstLine) {
      if (!walk(true)) return false;
      event.preventDefault();
      return true;
    }
    if (event.key === "ArrowDown" && caret.onLastLine) {
      if (!walk(false)) return false;
      event.preventDefault();
      return true;
    }
    return false;
  }

  function caretOf(element: HTMLTextAreaElement): ReplCaret {
    const text = element.value;
    const startAt = element.selectionStart;
    const endAt = element.selectionEnd;
    return {
      onFirstLine: startAt === endAt && !text.slice(0, startAt).includes("\n"),
      onLastLine: startAt === endAt && !text.slice(endAt).includes("\n"),
    };
  }

  const fieldApi: ReplInputField = {
    value,
    setValue: (text) => setValue(text),
    submit,
    keyDown,
    get label() {
      return messages().replInput;
    },
    id: fieldId,
    running,
  };

  props.handle?.({
    run(text) {
      if (canRun()) void execute(text);
    },
    print(...outputs) {
      const entry = newEntry(undefined, "done");
      for (const output of outputs) append(entry, output);
      setEntries([...untrack(entries), entry]);
    },
    clear,
    stop,
    focus() {
      (field() ?? document.getElementById(fieldId))?.focus();
    },
  });

  onCleanup(() => controller?.abort());

  if (!isServer) {
    createEffect(
      () => {
        entries()
          .flatMap((one) => one.outputs[0]().map((output) => output.text.length))
          .join();
        running();
        return transcript();
      },
      (element) => {
        if (element !== null) element.scrollTop = element.scrollHeight;
      },
    );
  }

  function lines(text: string): string[] {
    return props.language === undefined
      ? text.split("\n")
      : lightHighlightLines(text, props.language);
  }
  function rows(): number {
    return Math.min(Math.max(value().split("\n").length, 1), 12);
  }
  function plain(): string {
    const out: string[] = [];
    for (const entry of entries()) {
      if (entry.input !== undefined) {
        entry.input.split("\n").forEach((line, index) => {
          out.push(`${index === 0 ? prompt() : continuation()} ${line}`);
        });
      }
      for (const output of entry.outputs[0]()) out.push(stripAnsi(output.text).replace(/\n$/, ""));
    }
    return out.join("\n");
  }

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="repl"
      data-fill={props.fill === true ? "" : undefined}
      style={props.height === undefined ? undefined : { "--repl-height": cssLength(props.height) }}
    >
      <div class={cls().toolbar} data-slot="repl-toolbar">
        <span class={cls().title} data-slot="repl-title" aria-hidden="true">
          {label()}
        </span>
        {props.actions}
        <Show
          when={running()}
          fallback={
            <IconButton
              label={messages().replRun}
              size="sm"
              isDisabled={props.isDisabled === true || value().trim() === ""}
              onPress={submit}
            >
              <Play />
            </IconButton>
          }
        >
          <IconButton label={messages().replStop} size="sm" onPress={stop}>
            <Square />
          </IconButton>
        </Show>
        <IconButton
          label={messages().replClear}
          size="sm"
          isDisabled={entries().length === 0}
          onPress={clear}
        >
          <Eraser />
        </IconButton>
        <CopyButton value={plain()} label={messages().replCopy} size="icon-sm" variant="ghost" />
      </div>
      <div
        ref={transcript.set}
        class={cls().transcript}
        data-slot="repl-transcript"
        role="log"
        aria-label={label()}
        tabIndex={0}
      >
        <Show when={props.banner !== undefined}>
          <div class={arc(cls().output, cls().info)} data-slot="repl-banner" data-kind="info">
            {props.banner}
          </div>
        </Show>
        <Show when={entries().length === 0 && props.banner === undefined}>
          <div class={cls().empty} data-slot="repl-empty">
            {props.placeholder ?? messages().replEmpty}
          </div>
        </Show>
        <For each={entries()}>
          {(entry: LiveEntry) => (
            <div
              class={cls().entry}
              data-slot="repl-entry"
              dir="ltr"
              data-status={entry.status[0]()}
              aria-busy={entry.status[0]() === "running" ? "true" : undefined}
            >
              <Show when={entry.input !== undefined}>
                <div class={cls().echo} data-slot="repl-echo">
                  <span class={cls().prompt} aria-hidden="true">
                    {prompt()}
                  </span>
                  <span class={srOnly}>{messages().replEcho}</span>
                  <code class={cls().code} data-slot="repl-code">
                    <For each={lines(entry.input ?? "")}>
                      {(line: string, index: () => number) => (
                        <>
                          <Show when={index() > 0}>{"\n"}</Show>
                          <Show when={props.language !== undefined} fallback={line}>
                            <span innerHTML={line} />
                          </Show>
                        </>
                      )}
                    </For>
                  </code>
                </div>
              </Show>
              <For each={entry.outputs[0]()}>
                {(output: ReplOutput) => (
                  <div
                    class={arc(cls().output, output.kind === "info" ? cls().info : undefined)}
                    data-slot="repl-output"
                    data-kind={output.kind}
                  >
                    <Show when={output.kind !== "stdout" && output.kind !== "result"}>
                      <span class={srOnly}>{`${kindName(output.kind, messages())}: `}</span>
                    </Show>
                    <AnsiText text={output.text.replace(/\n$/, "")} />
                  </div>
                )}
              </For>
              <Show when={entry.status[0]() === "running"}>
                <div class={cls().status} data-slot="repl-running">
                  <Spinner />
                  {messages().replRunning}
                </div>
              </Show>
              <Show when={entry.status[0]() === "stopped"}>
                <div class={cls().status} data-slot="repl-stopped">
                  {messages().replStopped}
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class={cls().form} data-slot="repl-form" dir="ltr">
        <label class={cls().prompt} for={fieldId} data-slot="repl-prompt">
          <span aria-hidden="true">{prompt()}</span>
          <span class={srOnly}>{messages().replInput}</span>
        </label>
        <Show when={props.input === undefined} fallback={props.input?.(fieldApi)}>
          <textarea
            ref={field.set}
            id={fieldId}
            class={cls().input}
            data-slot="repl-input"
            rows={rows()}
            dir="ltr"
            spellcheck={false}
            autocomplete="off"
            autocapitalize="off"
            aria-keyshortcuts="Enter Shift+Enter ArrowUp ArrowDown Control+C Control+L"
            disabled={props.isDisabled === true}
            value={untrack(value)}
            onInput={(event: InputEvent) => {
              recall = -1;
              setValue((event.currentTarget as HTMLTextAreaElement).value, true);
            }}
            onKeyDown={(event: KeyboardEvent) => {
              keyDown(event, caretOf(event.currentTarget as HTMLTextAreaElement));
            }}
          />
        </Show>
      </div>
    </div>
  );
}
