/**
 * The calling convention, falsified rather than asserted.
 *
 * Every claim here is written so that the DEFAULT answer and the CORRECT answer
 * are different objects. A construct is handed scope A while an unrelated scope
 * B is ambient; a Block is invoked with no scope at all; `pin` is given
 * something to override. An implementation that resolves ownership from
 * `CURRENT` passes none of them, which is the whole point — the previous shape
 * of this suite could not tell the two apart, and `SEMANTICS.md` O2/O4.5 had no
 * executable channel because of it.
 */

import { describe, expect, test } from "bun:test";
import { Fragment, Show, For, Errored } from "./components.ts";
import {
  block,
  createContext,
  createScope,
  getContext,
  getOwner,
  flush,
  onCleanup,
  pin,
  provideOn,
  ScopeMissingError,
} from "./signals.ts";
import { provide } from "./scope.ts";
import type { Scope } from "./scope.ts";
import { insert, setProp } from "./dom.ts";

function chain(s: Scope | null, names: Map<Scope, string>): string {
  const out: string[] = [];
  for (let at = s; at !== null; at = at.parent) out.push(names.get(at) ?? "anon");
  out.push("null");
  return out.join(" -> ");
}

describe("O2: a construct runs under the scope it is GIVEN", () => {
  for (const [label, run] of [
    [
      "Fragment",
      (s: Scope | null, kid: (s: Scope | null) => Node) => Fragment(s, { children: kid }),
    ],
    [
      "Show",
      (s: Scope | null, kid: (s: Scope | null) => Node) =>
        Show(s, { when: () => true, children: kid }),
    ],
    [
      "For",
      (s: Scope | null, kid: (s: Scope | null) => Node) =>
        For(s, {
          each: () => [1],
          children: (_i: unknown, _n: unknown) => kid(getOwner() as Scope),
        }),
    ],
    [
      "Errored",
      (s: Scope | null, kid: (s: Scope | null) => Node) =>
        Errored(s, { fallback: () => document.createTextNode("x"), children: kid }),
    ],
  ] as const) {
    test(`${label}: given A while B is ambient, the child lands under A`, () => {
      const names = new Map<Scope, string>();
      let seen: Scope | null = null;
      createScope((_d, A) => {
        names.set(A, "A(passed)");
        createScope((_d2, B) => {
          names.set(B, "B(ambient)");
          const kid = (_s: Scope | null): Node => {
            seen = getOwner() as Scope;
            return document.createTextNode("k");
          };
          const el = run(A, kid);
          document.createElement("div").appendChild(el as Node);
          flush();
        });
      });
      const path = chain(seen, names);
      expect(path).toContain("A(passed)");
      expect(path).not.toContain("B(ambient)");
    });
  }
});

describe("rule 3: a Block invoked with no scope throws", () => {
  test("a compiled Block whose body inserts throws ScopeMissingError", () => {
    const b = (s?: Scope | null): Node => {
      const el = document.createElement("b");
      insert(s as Scope, el, () => "hi");
      return el;
    };
    expect(() => b()).toThrow(ScopeMissingError);
    expect(() => b(null)).not.toThrow();
  });
  test("setProp too", () => {
    expect(() => setProp(undefined as never, document.createElement("b"), "id", "x")).toThrow(
      ScopeMissingError,
    );
  });

  test("a Block that builds no DOM at all still throws, and files nothing on the ambient scope", () => {
    // The two tests above reach `insert`'s and `setProp`'s `requireScope`. This
    // one reaches `block`'s own entry guard, which is the negative the
    // convention rests on: a Block whose body only registers a cleanup, reads
    // context and returns a string is invisible to every claim that observes
    // what reached the DOM — and a fallback to CURRENT files its cleanup on
    // whatever scope happened to be ambient, which is the Provider bug.
    const Theme = createContext<string>("DEFAULT");
    const filed: string[] = [];
    let bodyRan = 0;
    const quiet = block((s?: Scope | null) => {
      bodyRan++;
      void s;
      onCleanup(() => filed.push("quiet"));
      return getContext(Theme) ?? "none";
    });

    let ambientCleanups = 0;
    createScope((dispose) => {
      expect(() => (quiet as (s?: Scope | null) => unknown)()).toThrow(ScopeMissingError);
      dispose();
      ambientCleanups = filed.length;
    });

    expect(bodyRan, "the body ran under the ambient owner").toBe(0);
    expect(ambientCleanups, "a cleanup was filed on the ambient scope").toBe(0);
  });
});

describe("O4.5: an explicit scope argument beats an ambient pin", () => {
  test("pin has something to override", () => {
    const names = new Map<Scope, string>();
    let seen: Scope | null = null;
    createScope((_d, X) => {
      names.set(X, "X(explicit)");
      createScope((_d2, P) => {
        names.set(P, "P(pinned)");
        pin(P, () => {
          const el = Fragment(X, {
            children: (): Node => {
              seen = getOwner() as Scope;
              return document.createTextNode("k");
            },
          });
          void el;
        })();
      });
    });
    expect(chain(seen, names)).toContain("X(explicit)");
  });
});

describe("X1/O2: a Provider provides on the scope it was GIVEN", () => {
  test("given A while B is ambient, the binding is installed on A's line", () => {
    const Ctx = createContext<string>("DEFAULT");
    const names = new Map<Scope, string>();
    let seenValue: string | null = null;
    let seenChain = "";

    createScope((_d, A) => {
      names.set(A, "A(passed)");
      provideOn(A, Symbol.for("marker.A"), 1);
      createScope((_d2, B) => {
        names.set(B, "B(ambient)");
        Ctx.Provider(A, {
          value: "PROVIDED",
          children: (s: Scope): Node => {
            seenValue = getContext(Ctx, getOwner());
            seenChain = chain(getOwner() as Scope, names);
            expect(s).toBe(getOwner() as Scope);
            return document.createTextNode("k");
          },
        } as never);
      });
    });

    expect(seenValue).toBe("PROVIDED");
    // The instance scope's PARENT is the scope the Provider was handed, not
    // the one that happened to be current at the call site.
    expect(seenChain).toContain("A(passed)");
    expect(seenChain).not.toContain("B(ambient)");
  });

  test("the same claim through `provide`, the primitive the compiler emits", () => {
    const Ctx = createContext<string>("DEFAULT");
    const names = new Map<Scope, string>();
    let seenChain = "";
    createScope((_d, A) => {
      names.set(A, "A(passed)");
      createScope((_d2, B) => {
        names.set(B, "B(ambient)");
        provide(
          A,
          Ctx,
          () => "V",
          (): Node => {
            seenChain = chain(getOwner() as Scope, names);
            return document.createTextNode("k");
          },
        );
      });
    });
    expect(seenChain).toContain("A(passed)");
    expect(seenChain).not.toContain("B(ambient)");
  });
});
