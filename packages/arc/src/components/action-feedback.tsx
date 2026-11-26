import { type Accessor, type Child, Show, createSignal } from "@barqjs/core";
import { toast } from "@barqjs/ui/sonner";

import type { Customisable } from "../lib/parts.ts";
import { InlineAlert, type alertStyles } from "./alert.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";

export interface ActionOptions<Input, Output> {
  /** A toast once it succeeds: "STRIPE_KEY deleted", or one worked out from what it returned. */
  success?: string | ((output: Output, input: Input) => string);
  /**
   * The failure stays with the action, for `ActionError` to show where it
   * happened: a form's save. Otherwise it is a toast.
   */
  inline?: boolean;
  /** Reload the current route's data once it succeeds, so the page shows the change. */
  invalidate?: boolean;
  /** After it succeeds and before it stops pending: refresh what it made stale. */
  onSuccess?: (output: Output, input: Input) => unknown;
  onError?: (error: unknown, input: Input) => void;
}

/** A mutation tied to its pending state, its success toast and its failure. */
export interface ActionState<Input, Output> {
  /**
   * Runs it. Resolves with its result, or `undefined` once it failed; the
   * failure is reported, never thrown.
   */
  run: (input: Input) => Promise<Output | undefined>;
  /** While a run is in flight: for a button's `isPending`. */
  pending: Accessor<boolean>;
  /** The last failure as a sentence, until the next run. */
  error: Accessor<string | undefined>;
  /** Forgets the last failure. */
  clear: () => void;
}

/**
 * Ties a mutation to what the reader sees of it: pending while it runs, a
 * toast when it succeeds, and its failure as a sentence in a toast or, with
 * `inline`, kept for `ActionError` beside the form that failed.
 *
 * ```tsx
 * const remove = useAction((id: string) => api.deleteVariable(id), {
 *   success: "Variable deleted",
 *   invalidate: true,
 * });
 * <Button isPending={remove.pending()} onPress={() => void remove.run(id)}>Delete</Button>
 * ```
 *
 * The failure's words are the server's, made a sentence (`serverMessage`).
 * `onSuccess` is awaited before it stops pending, so the list it refreshes
 * has its new rows by the time the button is free again.
 */
export function useAction<Input = void, Output = unknown>(
  action: (input: Input) => Output | Promise<Output>,
  options: ActionOptions<Input, Output> = {},
): ActionState<Input, Output> {
  const messages = useArcMessages();
  const router = maybeRouter();
  const [running, setRunning] = createSignal(0, { ownedWrite: true });
  const [error, setError] = createSignal<string | undefined>(undefined, { ownedWrite: true });

  async function run(input: Input): Promise<Output | undefined> {
    setError(undefined);
    setRunning((count) => count + 1);
    try {
      const output = await action(input);
      const success = options.success;
      if (success !== undefined) {
        toast.success(typeof success === "function" ? success(output, input) : success);
      }
      await options.onSuccess?.(output, input);
      if (options.invalidate === true) await router?.invalidate();
      return output;
    } catch (failure) {
      const sentence = serverMessage(failure, messages().somethingWentWrong);
      if (options.inline === true) setError(sentence);
      else toast.error(messages().actionFailed, { description: sentence });
      options.onError?.(failure, input);
      return undefined;
    } finally {
      setRunning((count) => count - 1);
    }
  }

  return {
    run,
    pending: () => running() > 0,
    error,
    clear: () => setError(undefined),
  };
}

type AlertSlots = ReturnType<typeof alertStyles>;

export interface ActionErrorProps extends Customisable<AlertSlots> {
  /** The action whose failure it shows. */
  action: ActionState<never, unknown>;
  /** A line in bold above the failure: "Not saved". */
  title?: Child;
}

/**
 * An inline action's failure, where it happened: a danger alert, which a
 * screen reader hears at once, gone again once the action runs again.
 *
 * ```tsx
 * const save = useAction(saveProfile, { inline: true, success: "Saved" });
 * <ActionError action={save} title="Not saved" />
 * ```
 */
export function ActionError(props: ActionErrorProps) {
  return (
    <Show when={props.action.error() !== undefined}>
      <InlineAlert
        tone="danger"
        title={props.title}
        class={props.class}
        className={props.className}
        classes={props.classes}
      >
        {props.action.error()}
      </InlineAlert>
    </Show>
  );
}
