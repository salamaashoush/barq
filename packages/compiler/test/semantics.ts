import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { compileSource, haltsHeld, loadModule, settle, stripLiterals } from "./harness.ts";
import {
  describeThrown,
  PreconditionFailed,
  SemanticViolation,
  type Claim,
  type Kit,
  type Thrown,
} from "./semantics-support.ts";

export const SEMANTICS_DIR = join(import.meta.dir, "..", "fixtures", "semantics");

/**
 * The L1 fixtures live in their own directory, out of `listFixtures()`'s reach,
 * for the same reason `browser-only/` does: the suites that run over the corpus
 * ask a question these cannot answer. `oracle.test.ts` compares two
 * implementations and both of them are wrong here; `ssr.test.ts` asks for
 * markup from a fixture whose whole point is that it throws. Keeping them out
 * is what lets M0 add nine fixtures without moving a single existing number.
 */
export function listSemanticFixtures(): string[] {
  return readdirSync(SEMANTICS_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.slice(0, -4))
    .sort();
}

export interface Outcome {
  fixture: string;
  claim: string;
  rule: string;
  says: string;
  /** `null` when the claim held; otherwise the message the failure carried. */
  failure: string | null;
  /** False when the claim reported through `kit.fail`, true when it crashed. */
  crashed: boolean;
}

interface SemanticModule {
  rules?: string[];
  claims?: Claim[];
}

function makeKit(emitted: string, containers: HTMLElement[]): Kit {
  return {
    container(): HTMLElement {
      const host = document.createElement("div");
      document.body.appendChild(host);
      containers.push(host);
      return host;
    },
    async attempt(body: (scope: null) => void | Promise<void>): Promise<Thrown[]> {
      const caught: Thrown[] = [];
      try {
        await body(null);
      } catch (error) {
        caught.push(describeThrown(error));
      }
      try {
        await settle();
      } catch (error) {
        caught.push(describeThrown(error));
      }
      return caught;
    },
    settle,
    emitted,
    fail(): never {
      throw new Error("the runner must bind a rule to `fail` before a claim sees the kit");
    },
    precondition(ok: boolean, observed: string): void {
      if (!ok) throw new PreconditionFailed(observed);
    },
  };
}

/**
 * `kit.fail` has to name the claim's rule, and the claim does not repeat it in
 * the call. Binding a per-claim `fail` is what keeps the rule ID out of the
 * fixture's prose, where a copy-paste could put the wrong one in a message.
 */
function bindRule(kit: Kit, rule: string): Kit {
  return {
    ...kit,
    fail(observed: string): never {
      throw new SemanticViolation(rule, observed);
    },
  };
}

function teardown(containers: HTMLElement[]): void {
  for (const host of containers) host.remove();
  containers.length = 0;
  // Portal targets default to document.body, and a fixture that died mid-render
  // can leave a marker pair behind; neither may reach the next claim.
  document.body.innerHTML = "";
}

export interface FixtureRun {
  fixture: string;
  /** The `rules` export, or `[]` when the module never loaded. */
  rules: string[];
  outcomes: Outcome[];
}

export async function runSemanticFixture(
  name: string,
  options: { optimize?: number; interp?: boolean } = {},
): Promise<FixtureRun> {
  const source = readFileSync(join(SEMANTICS_DIR, `${name}.tsx`), "utf8");

  let mod: SemanticModule;
  let emitted: string;
  try {
    const code = compileSource(source, `${name}.tsx`, options);
    emitted = stripLiterals(code);
    // The level and the backend are in the tag so a failing load names where it
    // came from; identity is harness.ts's per-load `seq`, not the tag.
    const tag = `sem-${name}-O${options.optimize ?? "x"}${options.interp ? "-interp" : ""}`;
    mod = (await loadModule(code, tag)) as SemanticModule;
  } catch (error) {
    const thrown = describeThrown(error);
    return {
      fixture: name,
      rules: [],
      outcomes: [
        {
          fixture: name,
          claim: "<load>",
          rule: "<none>",
          says: "the fixture compiles and loads",
          failure: `${thrown.name}: ${thrown.message}`,
          crashed: true,
        },
      ],
    };
  }

  const rules = mod.rules ?? [];
  const claims = mod.claims ?? [];
  const outcomes: Outcome[] = [];
  const containers: HTMLElement[] = [];
  const kit = makeKit(emitted, containers);

  const core = await import("@barqjs/core");
  for (const claim of claims) {
    let failure: string | null = null;
    let crashed = false;
    // A claim that provokes an uncaught error halts the engine, which is the
    // claim's own observation and not a condition the next one starts from.
    core.resetErrorHalt();
    try {
      await haltsHeld(async () => claim.check(bindRule(kit, claim.rule)));
    } catch (error) {
      if (error instanceof SemanticViolation) {
        failure = error.message;
      } else {
        const thrown = describeThrown(error);
        failure = `${thrown.name}: ${thrown.message}`;
        crashed = true;
      }
    } finally {
      teardown(containers);
    }
    outcomes.push({
      fixture: name,
      claim: claim.id,
      rule: claim.rule,
      says: claim.says,
      failure,
      crashed,
    });
  }

  if (claims.length === 0) {
    outcomes.push({
      fixture: name,
      claim: "<empty>",
      rule: "<none>",
      says: "the fixture declares at least one claim",
      failure: "the fixture exports no claims, so it pins nothing",
      crashed: true,
    });
  }

  return { fixture: name, rules, outcomes };
}
