/**
 * L4 — the leak oracle, for O3.7 and B4.
 *
 * `leaks.ts` states the five probes and why each one needs to be taken from
 * outside the runtime. Every probe runs on every fixture in the corpus, any
 * finding fails the suite, and each probe is asserted to be LIVE: a probe that
 * cannot fire reports zero for the same reason a correct runtime does.
 */

import { describe, expect, it } from "bun:test";

import { fixtureSource, listFixtures } from "./harness.ts";
import { findLeaks, formatLeaks, type LeakFinding } from "./leaks.ts";
import { l4Source, listL4Fixtures, openSession, type Session } from "./session.ts";

const CORPUS = listFixtures();
const L4 = listL4Fixtures();

const sessions = new Map<string, Session>();
for (const name of CORPUS) sessions.set(name, await openSession(name, fixtureSource(name)));
for (const name of L4) sessions.set(name, await openSession(name, l4Source(name)));

const findings: LeakFinding[] = [];
for (const session of sessions.values()) findings.push(...findLeaks(session));

describe("L4 — the leak oracle", () => {
  it("the probes are installed, so a zero is an observation and not a silence", () => {
    // The listener probe once patched `globalThis.EventTarget.prototype` and
    // intercepted nothing, because under the global registrator a DOM node can
    // inherit happy-dom's class while the global is the host's. It reported
    // zero listeners for a fixture that registers four, and it reported it
    // exactly as confidently as a correct runtime would.
    for (const [name, session] of sessions) {
      expect(session.listenerOwners, `${name}: the listener probe patched nothing`).toBeGreaterThan(
        0,
      );
      expect(
        session.scopesEntered,
        `${name}: the ownership trace saw no scope at all`,
      ).toBeGreaterThan(0);
    }
    // Not per fixture: a provably-static tree creates zero effects and that is
    // the optimality claim `dangerously-set-inner-html` exists to make. The
    // tracer being wired is a fact about the corpus.
    const effects = [...sessions.values()].reduce((n, s) => n + s.effectsCreated, 0);
    expect(effects, "the effect tracer saw no effect anywhere in the corpus").toBeGreaterThan(50);
  });

  it("at least one fixture registers a listener, so the listener probe has a subject", () => {
    const registered = [...sessions.values()].reduce((n, s) => n + s.listeners.length, 0);
    expect(registered).toBeGreaterThan(0);
  });

  it("no fixture leaks anything", () => {
    expect(formatLeaks(findings)).toBe("");
  });

  it("O3.7's four non-listener clauses hold everywhere", () => {
    // The rule names effects, subscriptions, async continuations and the scopes
    // that own them.
    const o37 = findings.filter((finding) => finding.rule === "O3.7");
    expect(formatLeaks(o37)).toBe("");
  });

  it("B4 holds, and the probe that says so still discriminates", () => {
    // `listen` registers a cleanup on the scope that owns the element, so
    // removal is not something a call site can forget. The count B4's
    // falsification procedure asks for, registered listeners after dispose, is 0.
    expect(formatLeaks(findings.filter((finding) => finding.rule === "B4"))).toBe("");

    // A green probe proves nothing unless it can see listeners at all, so the
    // corpus is required to register some and every one is required removed.
    const registered = [...sessions.values()].flatMap((session) =>
      session.listeners.filter((record) => !record.delegated),
    );
    expect(registered.length, "the corpus has to register listeners at all").toBeGreaterThan(0);
    expect(registered.filter((record) => record.outstanding)).toEqual([]);
  });

  it("a root's delegated listeners are seen, and leave with the root", () => {
    // Delegated listeners sit on the container `render` mounted into and are
    // removed when that root is disposed, so B4 holds them to the same count as
    // every other listener. A probe that could not SEE them would report the
    // same zero for a root that stopped removing them.
    const delegated = [...sessions.values()].flatMap((s) =>
      s.listeners.filter((record) => record.delegated),
    );
    expect(delegated.length).toBeGreaterThan(0);
    expect(delegated.filter((record) => record.outstanding)).toEqual([]);
  });
});

describe("L4 — the leak probes are not inert", () => {
  /**
   * Each probe is driven from a corrupted SESSION: the field it reads is moved
   * off zero and the finding must appear, with the rule its clause belongs to.
   * A probe that cannot produce a finding reports the same zero a correct
   * runtime does, and the difference is the whole value of the oracle.
   */
  const subject = (): Session => {
    const session = sessions.get("control-flow-show");
    if (session === undefined) throw new Error("control-flow-show is no longer a fixture");
    return session;
  };

  it("the scope probe fires on an undisposed scope", () => {
    const found = findLeaks({ ...subject(), scopesNeverDisposed: [7, 9] });
    expect(found.map((f) => f.id)).toContain("scope@2-scopes");
    expect(found.find((f) => f.kind === "scope")?.rule).toBe("O3.7");
  });

  it("the effect probe fires on a run after disposal", () => {
    const found = findLeaks({ ...subject(), effectRunsAfterDispose: 3 });
    expect(found.map((f) => f.id)).toContain("effect@3-runs");
  });

  it("the listener probe fires on an outstanding non-delegated listener", () => {
    const found = findLeaks({
      ...subject(),
      listeners: [{ type: "click", target: "button", outstanding: true, delegated: false }],
    });
    expect(found.map((f) => f.id)).toContain("listener@button.click");
    expect(found.find((f) => f.kind === "listener")?.rule).toBe("B4");
  });

  it("the async probe fires on a continuation that ran after disposal", () => {
    const found = findLeaks({ ...subject(), asyncAfterDispose: 1 });
    expect(found.map((f) => f.id)).toContain("async@1-continuations");
  });

  it("the async probe fires on a continuation still in flight at teardown", () => {
    // The canonical shape — one outstanding timer or fetch when the window
    // closed. It never runs, so the ran-after counter above cannot see it, and
    // for one round the session RECORDED it and `findLeaks` never read the field.
    const found = findLeaks({ ...subject(), asyncStillPending: 1 });
    expect(found.map((f) => f.id)).toContain("async@1-pending");
    expect(found.find((f) => f.kind === "async")?.rule).toBe("O3.7");
  });

  it("the node probe fires on a clone still attached and on a non-empty container", () => {
    const clones = findLeaks({ ...subject(), clonesAttachedAfterDispose: 2 });
    expect(clones.map((f) => f.id)).toContain("node@2-clones");
    const held = findLeaks({ ...subject(), containerAfterDispose: "<p>still here</p>" });
    expect(held.map((f) => f.id)).toContain("node@container");
  });

  it("an unmutated session produces no finding", () => {
    // The null mutant. Without it every row above could be an artefact of the
    // corruption helper rather than of the probe.
    expect(findLeaks(subject())).toEqual([]);
  });
});
