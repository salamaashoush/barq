import {
  type Accessor,
  type Child,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { CloudOff } from "@barqjs/lucide/icons/cloud-off";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { online } from "@barqjs/primitives/browser";
import { on as listen } from "@barqjs/primitives/event";
import { shortcut } from "@barqjs/primitives/keyboard";
import { useBlocker } from "@barqjs/router";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, tone, type } from "../style/index.ts";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";
import { confirmDiscard } from "./unsaved-changes-guard.tsx";

/**
 * Where a draft stands against the server: nothing to save, a change waiting
 * for its pause, a save under way, saved, a save that failed, held while the
 * device is offline, or held because the draft cannot be stored as it is.
 */
export type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "offline" | "blocked";

export interface AutosaveOptions<T> {
  /** The draft, read reactively: a form's values, an editor's document. */
  value: () => T;
  /** Stores it. A promise holds the state at saving until it settles; a rejection is the failure. */
  save: (value: T) => unknown;
  /** How long changes have to pause first, in milliseconds. @default 1000 */
  delay?: number;
  /** Saves nothing while this answers false: a record still loading, a reader who may not edit. */
  enabled?: () => boolean;
  /** Why the draft cannot be stored as it is, or `undefined` when it can: a required title left empty. */
  blockedBy?: (value: T) => string | undefined;
  /** What two drafts are compared by. @default `JSON.stringify` */
  key?: (value: T) => string;
  /** The key that saves at once, or `false` for none. @default "mod+s" */
  shortcut?: string | false;
}

export interface Autosave<T> {
  state: Accessor<SaveState>;
  /** Why the last save failed, as a sentence, or why the draft is held. */
  reason: Accessor<string | undefined>;
  /** The last save's error itself, until a save succeeds. */
  failure: Accessor<unknown>;
  /** The draft differs from what was last saved. */
  dirty: Accessor<boolean>;
  /** Saves what is waiting now. Resolves false when the save failed or could not run. */
  flush: () => Promise<boolean>;
  /** Saves the draft as it is now, even where its last save failed. */
  retry: () => Promise<boolean>;
  /** The server holds this already: a record loaded again, a save made some other way. */
  markSaved: (value: T) => void;
}

interface Waiting<T> {
  value: T;
  key: string;
}

/**
 * Saves a draft once changes pause, one save at a time.
 *
 * ```tsx
 * const form = useArcForm(() => ({ defaultValues: lesson }));
 * const autosave = useAutosave({
 *   value: form.useSelector((state) => state.values),
 *   save: (value) => api.saveLesson(value),
 * });
 * <SaveStatus autosave={autosave} />
 * ```
 *
 * A change made while a save is in flight is saved once that one lands, so
 * the server never sees two at once or an older draft after a newer one.
 * Mod+S saves at once. Offline it holds the draft and saves it when the
 * connection is back. Leaving the page with a save waiting saves first, and
 * asks before throwing away a draft whose save failed; closing the tab gets
 * the browser's own question. Unmounting saves what is waiting.
 */
export function useAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const messages = useArcMessages();
  const connected = online();
  const keyOf = options.key ?? ((value: T) => JSON.stringify(value));
  const delay = options.delay ?? 1000;
  let savedKey = keyOf(untrack(options.value));
  let everSaved = false;
  let waiting: Waiting<T> | null = null;
  let running: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const [state, setState] = createSignal<SaveState>("idle", { ownedWrite: true });
  const [reason, setReason] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [failure, setFailure] = createSignal<unknown>(undefined, { ownedWrite: true });
  const [saved, setSaved] = createSignal(savedKey, { ownedWrite: true });

  function enabled(): boolean {
    return options.enabled?.() ?? true;
  }

  function stopTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function settledState(): SaveState {
    return everSaved ? "saved" : "idle";
  }

  async function drain(): Promise<boolean> {
    while (waiting !== null) {
      const next: Waiting<T> = waiting;
      if (next.key === savedKey) {
        waiting = null;
        break;
      }
      const blocked = options.blockedBy?.(next.value);
      if (blocked !== undefined) {
        setReason(blocked);
        setState("blocked");
        return false;
      }
      if (!connected()) {
        setReason(undefined);
        setState("offline");
        return false;
      }
      setState("saving");
      try {
        await options.save(next.value);
      } catch (error) {
        setFailure(error);
        setReason(serverMessage(error, messages().saveFailed));
        setState("error");
        return false;
      }
      savedKey = next.key;
      everSaved = true;
      setSaved(next.key);
      if (waiting === next) waiting = null;
    }
    setFailure(undefined);
    setReason(undefined);
    setState(settledState());
    return true;
  }

  function run(): Promise<boolean> {
    stopTimer();
    if (running !== null) return running.then(() => run());
    running = drain().finally(() => {
      running = null;
    });
    return running;
  }

  function changed(value: T, key: string): void {
    if (key === savedKey) {
      if (running !== null) {
        waiting = { value, key };
        return;
      }
      stopTimer();
      waiting = null;
      setReason(undefined);
      setState(settledState());
      return;
    }
    waiting = { value, key };
    const blocked = options.blockedBy?.(value);
    if (blocked !== undefined) {
      stopTimer();
      setReason(blocked);
      setState("blocked");
      return;
    }
    setState("pending");
    stopTimer();
    timer = setTimeout(() => void run(), delay);
  }

  function current(): Waiting<T> {
    const value = untrack(options.value);
    return { value, key: keyOf(value) };
  }

  function retry(): Promise<boolean> {
    waiting = current();
    return run();
  }

  function flush(): Promise<boolean> {
    if (waiting === null) return running ?? Promise.resolve(state() !== "error");
    return run();
  }

  function busy(): boolean {
    return running !== null || waiting !== null;
  }

  if (!isServer) {
    createEffect(
      () => {
        const value = options.value();
        return { value, key: keyOf(value), on: enabled() };
      },
      (next) => {
        if (next.on) changed(next.value, next.key);
      },
    );
    createEffect(connected, (up) => {
      if (up && waiting !== null && untrack(state) === "offline") void run();
    });
    const combo = options.shortcut ?? "mod+s";
    if (combo !== false) {
      shortcut(
        combo,
        () => {
          if (!untrack(enabled)) return;
          void retry();
        },
        { whileTyping: true },
      );
    }
    if (maybeRouter() === undefined) {
      listen(window, "beforeunload", (event: BeforeUnloadEvent) => {
        if (busy()) event.preventDefault();
      });
    }
    onCleanup(() => {
      if (waiting !== null && untrack(enabled)) void run();
    });
  }
  if (maybeRouter() !== undefined) {
    useBlocker({
      shouldBlockFn: async () => {
        if (!busy()) return false;
        if (await flush()) return false;
        return !(await confirmDiscard({}, messages()));
      },
      enableBeforeUnload: busy,
    });
  }

  return {
    state,
    reason,
    failure,
    dirty: () => keyOf(options.value()) !== saved(),
    flush,
    retry,
    markSaved: (value: T) => {
      savedKey = keyOf(value);
      setSaved(savedKey);
      if (waiting?.key === savedKey) {
        waiting = null;
        stopTimer();
      }
    },
  };
}

// --- the indicator ---------------------------------------------------------------

export const saveStatusStyles = variants({
  slots: {
    root: arc(layout.inlineRow, gap[2], layout.minZero, type.meta),
    status: arc(layout.inlineRow, gap[1.5], layout.minZero, glyph.sm),
    label: arc(layout.clip, layout.nowrap),
    reason: arc(layout.clip, layout.nowrap, fg.muted),
    retry: arc({}),
  },
  variants: {
    state: {
      idle: {},
      pending: {},
      saving: {},
      saved: {},
      error: { status: arc(tone.danger, fg.tone) },
      offline: { status: arc(tone.warning, fg.tone) },
      blocked: {},
    },
    compact: {
      true: { label: arc({ [on.belowSm]: { display: "none" } }) },
      false: {},
    },
  },
  defaults: { state: "idle", compact: false },
});

type Slots = ReturnType<typeof saveStatusStyles>;

export interface SaveStatusProps extends Customisable<Slots> {
  /** The draft's state. Given `autosave`, its own. */
  state?: SaveState;
  /** Why it failed or is held. Given `autosave`, its own. */
  reason?: Child;
  /** A Retry beside a failed save. Given `autosave`, its `retry`. */
  onRetry?: () => void;
  /** Reads its state, reason and retry from `useAutosave`. */
  autosave?: Autosave<never>;
  /** On a phone the words go and the icon stays, still read by a screen reader. */
  compact?: boolean;
}

/**
 * Where a draft stands, in a few words: Saving…, Saved, Not saved with why
 * and a Retry, Offline with the draft held, or why it cannot be saved yet.
 *
 * ```tsx
 * <SaveStatus autosave={autosave} compact />
 * <SaveStatus state="error" reason="The server is not answering." onRetry={save} />
 * ```
 *
 * A polite status, so a screen reader hears it change without losing its
 * place; it says nothing while there is nothing to save.
 */
export function SaveStatus(props: SaveStatusProps) {
  const messages = useArcMessages();
  function current(): SaveState {
    return props.autosave?.state() ?? props.state ?? "idle";
  }
  function why(): Child {
    return props.autosave?.reason() ?? props.reason;
  }
  function retry(): (() => void) | undefined {
    const autosave = props.autosave;
    if (autosave !== undefined) return () => void autosave.retry();
    return props.onRetry;
  }
  function cls(): Slots {
    return parts(
      saveStatusStyles({ state: current(), compact: props.compact === true }),
      props.classes,
    );
  }
  function words(): string {
    switch (current()) {
      case "pending":
      case "saving":
        return messages().saving;
      case "saved":
        return messages().saved;
      case "error":
        return messages().saveFailed;
      case "offline":
        return messages().savedWhenOnline;
      case "blocked":
        return messages().notSavedYet;
      default:
        return "";
    }
  }
  function icon(): Child {
    switch (current()) {
      case "pending":
      case "saving":
        return <Spinner aria-hidden="true" />;
      case "saved":
        return <Check aria-hidden="true" />;
      case "error":
        return <TriangleAlert aria-hidden="true" />;
      case "offline":
        return <CloudOff aria-hidden="true" />;
      case "blocked":
        return <CircleAlert aria-hidden="true" />;
      default:
        return null;
    }
  }
  function hasReason(): boolean {
    const reason = why();
    return (
      (current() === "error" || current() === "blocked") &&
      reason !== undefined &&
      reason !== null &&
      reason !== ""
    );
  }
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      data-slot="save-status"
      data-state={current()}
    >
      <span class={cls().status} role="status" data-slot="save-status-text">
        {icon()}
        <span class={cls().label} aria-hidden={props.compact === true ? "true" : undefined}>
          {words()}
        </span>
        <Show when={props.compact === true && words() !== ""}>
          <span class={srOnly}>{words()}</span>
        </Show>
        <Show when={hasReason()}>
          <span class={cls().reason} data-slot="save-status-reason">
            {why()}
          </span>
        </Show>
      </span>
      <Show when={current() === "error" && retry() !== undefined}>
        <Button
          variant="link"
          size="xs"
          class={cls().retry}
          data-slot="save-status-retry"
          onPress={() => retry()?.()}
        >
          {messages().retry}
        </Button>
      </Show>
    </span>
  );
}
