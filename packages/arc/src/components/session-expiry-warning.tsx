import { type Child, Match, Switch, createEffect, createSignal, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { Button } from "@barqjs/ui/button";

import type { Customisable } from "../lib/parts.ts";
import { InlineAlert, type alertStyles } from "./alert.tsx";
import { Countdown, useClock } from "./countdown.tsx";
import { type Moment, toDate } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { Sentence } from "./sentence.tsx";

type AlertSlots = ReturnType<typeof alertStyles>;

export interface SessionExpiryWarningProps extends Customisable<AlertSlots> {
  /** When it ends. Moves on with every use, so it is read live. */
  expiresAt: Moment;
  /** The request's time, for a server render; see `Countdown`. */
  now?: Moment;
  /** How long before the end it appears, in milliseconds. @default 180000 */
  warnWithin?: number;
  /**
   * Why it ends: `idle`, with nothing using it, offers to keep it alive;
   * `limit`, at its time limit, offers to extend it. @default "idle"
   */
  reason?: "idle" | "limit";
  /** Keeps it alive or extends it; its promise holds the button pending. */
  onExtend?: () => unknown;
  /** @default the provider's `keepAlive` or `extendSession` */
  extendLabel?: Child;
  /** Once it has ended. */
  onExpire?: () => void;
}

/**
 * Warns that a session is about to end, with a live countdown and the
 * action that keeps it going: Keep alive when nothing is using it, Extend
 * at its time limit. Hidden until `warnWithin` of the end, and a danger
 * alert saying it ended once it has.
 *
 * ```tsx
 * <SessionExpiryWarning
 *   expiresAt={session.endsAt}
 *   reason={session.idle ? "idle" : "limit"}
 *   onExtend={() => api.extend(session.id)}
 * />
 * ```
 *
 * A warning-toned status that waits its turn for a screen reader, whose
 * countdown announces once a minute rather than every second.
 */
export function SessionExpiryWarning(props: SessionExpiryWarningProps) {
  const messages = useArcMessages();
  const [pending, setPending] = createSignal(false, { ownedWrite: true });
  const clock = useClock(
    () => props.now,
    () => true,
  );
  function left(): number | undefined {
    const now = clock();
    return now === undefined ? undefined : toDate(props.expiresAt).getTime() - now;
  }
  function state(): "hidden" | "warning" | "ended" {
    const remaining = left();
    if (remaining === undefined || remaining > (props.warnWithin ?? 180_000)) return "hidden";
    return remaining <= 0 ? "ended" : "warning";
  }
  if (!isServer) {
    let ended = false;
    createEffect(state, (now) => {
      if (now !== "ended") {
        ended = false;
        return;
      }
      if (ended) return;
      ended = true;
      untrack(() => props.onExpire?.());
    });
  }
  async function extend(): Promise<void> {
    setPending(true);
    try {
      await props.onExtend?.();
    } finally {
      setPending(false);
    }
  }
  function idle(): boolean {
    return (props.reason ?? "idle") === "idle";
  }
  return (
    <Switch>
      <Match when={state() === "warning"}>
        <InlineAlert
          tone="warning"
          live="status"
          class={props.class}
          className={props.className}
          classes={props.classes}
          title={
            <Sentence words={messages().sessionEndsIn}>
              <Countdown to={props.expiresAt} now={props.now} announceEvery={60_000} />
            </Sentence>
          }
          actions={
            props.onExtend === undefined ? undefined : (
              <Button
                size="sm"
                variant="outline"
                isPending={pending()}
                onPress={() => void extend()}
              >
                {props.extendLabel ?? (idle() ? messages().keepAlive : messages().extendSession)}
              </Button>
            )
          }
        >
          {idle() ? messages().sessionIdle : messages().sessionLimit}
        </InlineAlert>
      </Match>
      <Match when={state() === "ended"}>
        <InlineAlert
          tone="danger"
          class={props.class}
          className={props.className}
          classes={props.classes}
          title={messages().sessionEnded}
        />
      </Match>
    </Switch>
  );
}
