/**
 * The leak oracle, for O3.7 and B4.
 *
 * > After disposal, every effect, listener, subscription and async continuation
 * > must be released.
 *
 * That sentence names four things and, before this file, the repository could
 * observe none of them. The DOM channels cannot: a leaked listener, a live
 * effect and a pending continuation all serialize to the empty string, and a
 * differential oracle whose reference leaks the same way certifies the leak. So
 * the five probes below are taken from OUTSIDE the runtime, in the same window
 * as the render, and they answer the four clauses plus the one the rule assumes:
 *
 * | probe      | clause                | how it is observed                        |
 * |------------|-----------------------|-------------------------------------------|
 * | `scope`    | the owner itself      | ownership trace: entered, never disposed  |
 * | `effect`   | "every effect"        | every signal poked AFTER disposal; any run |
 * | `listener` | "every listener"      | `addEventListener` matched to its removal  |
 * | `async`    | "async continuation"  | scheduled before disposal, ran after it —  |
 * |            |                       | or never resolved at all                  |
 * | `node`     | the range it owned    | a template clone still in the document    |
 *
 * ## Why the effect probe pokes rather than counts
 *
 * A count of live effects is not observable — the runtime exposes no registry
 * and `scopeAllocations()` is monotonic. But an effect that is still subscribed
 * has one behaviour nothing else has: it RUNS. So the window outlives the
 * disposal, writes every signal the fixture exports a value it does not hold,
 * flushes twice, and asks whether any traced effect's run counter moved. Zero is
 * the rule. This is the strongest of the five, because it cannot be satisfied by
 * accident: a leaked subscription that never fires is indistinguishable from no
 * subscription for every purpose anyone has.
 *
 * ## What a finding is, and what a row in the registry is
 *
 * A finding is `(fixture, kind, detail)`. `leak-known-failures.ts` carries the
 * same four assertions the other two registries do — stale rows fail, unregistered
 * findings fail, a row whose rule is not the rule the probe named fails, and every
 * rule is a defined rule. There is no wildcard and no opt-out.
 */

import type { Session } from "./session.ts";

export type LeakKind = "scope" | "effect" | "listener" | "async" | "node";

/** Every rule this channel can report. The channel's declared reach, not today's output. */
export const LEAK_RULES: readonly string[] = Object.freeze(["O3.7", "B4"]);

const RULE_OF: Record<LeakKind, string> = {
  scope: "O3.7",
  effect: "O3.7",
  listener: "B4",
  async: "O3.7",
  node: "O3.7",
};

export interface LeakFinding {
  fixture: string;
  kind: LeakKind;
  /** the rule this probe is a falsification procedure for */
  rule: string;
  /**
   * Stable within a fixture: `<kind>@<what>`. The detail is part of the identity
   * because one fixture leaking a `mouseenter` and a `focus` listener is two
   * defects, and an id naming only the kind would let the second land inside the
   * first's registry row unseen.
   */
  id: string;
  message: string;
}

/**
 * A listener on `document` is module-scope event delegation, not per-position
 * state: one handler per event type for the whole process, installed by
 * `delegateEvents` and removed by `clearDelegatedEvents`. B4 is about the
 * listener a POSITION owns, and folding delegation in would report one finding
 * per fixture that uses `onClick` — which is every interesting fixture, and none
 * of them is the bug.
 */
function isDelegation(target: string, delegated: boolean): boolean {
  return delegated || target === "document";
}

export function findLeaks(session: Session): LeakFinding[] {
  const found: LeakFinding[] = [];
  const say = (kind: LeakKind, id: string, message: string): void => {
    found.push({
      fixture: session.fixture,
      kind,
      rule: RULE_OF[kind],
      id: `${kind}@${id}`,
      message,
    });
  };

  if (session.scopesNeverDisposed.length > 0) {
    say(
      "scope",
      `${session.scopesNeverDisposed.length}-scopes`,
      `${session.scopesNeverDisposed.length} of ${session.scopesEntered} scope(s) entered inside ` +
        "the window were never disposed. Disposal is total (O3): a scope the render root cannot " +
        "reach holds its cleanups, its context, its abort signal and its range forever",
    );
  }

  if (session.effectRunsAfterDispose > 0) {
    say(
      "effect",
      `${session.effectRunsAfterDispose}-runs`,
      `${session.effectRunsAfterDispose} effect run(s) after \`dispose()\` returned, out of ` +
        `${session.effectsCreated} effect(s) created. A disposed scope's effects are unsubscribed, ` +
        "so a run here is a subscription the disposal did not reach",
    );
  }

  const outstanding = new Map<string, number>();
  for (const record of session.listeners) {
    if (!record.outstanding) continue;
    if (isDelegation(record.target, record.delegated)) continue;
    const key = `${record.target}.${record.type}`;
    outstanding.set(key, (outstanding.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...outstanding.entries()].sort()) {
    say(
      "listener",
      key,
      `${count} \`${key}\` listener(s) still registered after disposal. B4: every listener ` +
        "registers a cleanup on the owning scope, so removal cannot be forgotten",
    );
  }

  if (session.asyncAfterDispose > 0) {
    say(
      "async",
      `${session.asyncAfterDispose}-continuations`,
      `${session.asyncAfterDispose} continuation(s) scheduled before disposal ran after it. An ` +
        "async continuation that fires into a disposed scope leaves no trace in the DOM, the " +
        "scope tree or the effect counts, which is why it needs a probe of its own",
    );
  }

  // The canonical shape, and the one the ran-after counter cannot see: a timer
  // or a fetch still in flight when the window closed never runs, so it is
  // invisible to a probe that only counts callbacks that fired. The counter is
  // restricted to continuations scheduled BEFORE disposal and decremented by
  // `clearTimeout`, so a cancelled timer is not outstanding and the driver's own
  // post-disposal settle is not counted.
  if (session.asyncStillPending > 0) {
    say(
      "async",
      `${session.asyncStillPending}-pending`,
      `${session.asyncStillPending} continuation(s) scheduled before disposal were still ` +
        "outstanding when the window closed. O3.7 says every async continuation is RELEASED by " +
        "disposal, and one that never resolves holds its whole closure — the scope it captured, " +
        "the nodes that scope built — for as long as the timer lives",
    );
  }

  if (session.clonesAttachedAfterDispose > 0) {
    say(
      "node",
      `${session.clonesAttachedAfterDispose}-clones`,
      `${session.clonesAttachedAfterDispose} template clone(s) still attached to the document ` +
        "after disposal",
    );
  }

  if (session.containerAfterDispose !== "") {
    say(
      "node",
      "container",
      `the container still holds ${JSON.stringify(session.containerAfterDispose)} after disposal`,
    );
  }

  return found;
}

export function formatLeaks(findings: readonly LeakFinding[]): string {
  return findings.map((f) => `  [${f.rule} ${f.id} @ ${f.fixture}] ${f.message}`).join("\n");
}
