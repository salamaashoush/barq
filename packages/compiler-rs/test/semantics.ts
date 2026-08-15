import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { compileSource, loadModule, stripLiterals } from "./harness.ts"
import {
  describeThrown,
  PreconditionFailed,
  SemanticViolation,
  type Claim,
  type Kit,
  type Thrown,
} from "./semantics-support.ts"

export const SEMANTICS_DIR = join(import.meta.dir, "..", "fixtures", "semantics")
export const SEMANTICS_DOC = join(import.meta.dir, "..", "SEMANTICS.md")

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
    .sort()
}

export interface Outcome {
  fixture: string
  claim: string
  rule: string
  says: string
  /** `null` when the claim held; otherwise the message the failure carried. */
  failure: string | null
  /** False when the claim reported through `kit.fail`, true when it crashed. */
  crashed: boolean
}

interface SemanticModule {
  rules?: string[]
  claims?: Claim[]
}

async function settle(): Promise<void> {
  const core = await import("@barqjs/core")
  core.flush()
  await new Promise((r) => setTimeout(r, 0))
  core.flush()
  await new Promise((r) => setTimeout(r, 0))
}

function makeKit(emitted: string, containers: HTMLElement[]): Kit {
  return {
    container(): HTMLElement {
      const host = document.createElement("div")
      document.body.appendChild(host)
      containers.push(host)
      return host
    },
    async attempt(body: (scope: null) => void | Promise<void>): Promise<Thrown[]> {
      const caught: Thrown[] = []
      try {
        await body(null)
      } catch (error) {
        caught.push(describeThrown(error))
      }
      try {
        await settle()
      } catch (error) {
        caught.push(describeThrown(error))
      }
      return caught
    },
    settle,
    emitted,
    fail(): never {
      throw new Error("the runner must bind a rule to `fail` before a claim sees the kit")
    },
    precondition(ok: boolean, observed: string): void {
      if (!ok) throw new PreconditionFailed(observed)
    },
  }
}

/**
 * `kit.fail` has to name the claim's rule, and the claim does not repeat it in
 * the call. Binding a per-claim `fail` is what keeps the rule ID out of the
 * fixture's prose, where a copy-paste could put the wrong one in a message the
 * registry then checks against the right one.
 */
function bindRule(kit: Kit, rule: string): Kit {
  return {
    ...kit,
    fail(observed: string): never {
      throw new SemanticViolation(rule, observed)
    },
  }
}

async function teardown(containers: HTMLElement[]): Promise<void> {
  const core = await import("@barqjs/core")
  for (const host of containers) host.remove()
  containers.length = 0
  // Portal targets default to document.body, and a fixture that died mid-render
  // can leave a marker pair behind; neither may reach the next claim.
  document.body.innerHTML = ""
  core.clearDelegatedEvents()
}

export interface FixtureRun {
  fixture: string
  /** The `rules` export, or `[]` when the module never loaded. */
  rules: string[]
  outcomes: Outcome[]
}

export async function runSemanticFixture(
  name: string,
  options: { optimize?: number; interp?: boolean } = {},
): Promise<FixtureRun> {
  const source = readFileSync(join(SEMANTICS_DIR, `${name}.tsx`), "utf8")

  let mod: SemanticModule
  let emitted: string
  try {
    const code = compileSource(source, `${name}.tsx`, options)
    emitted = stripLiterals(code)
    // The level and the backend are in the tag so a failing load names where it
    // came from; identity is harness.ts's per-load `seq`, not the tag.
    const tag = `sem-${name}-O${options.optimize ?? "x"}${options.interp ? "-interp" : ""}`
    mod = (await loadModule(code, tag)) as SemanticModule
  } catch (error) {
    const thrown = describeThrown(error)
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
    }
  }

  const rules = mod.rules ?? []
  const claims = mod.claims ?? []
  const outcomes: Outcome[] = []
  const containers: HTMLElement[] = []
  const kit = makeKit(emitted, containers)

  for (const claim of claims) {
    let failure: string | null = null
    let crashed = false
    try {
      await claim.check(bindRule(kit, claim.rule))
    } catch (error) {
      if (error instanceof SemanticViolation) {
        failure = error.message
      } else {
        const thrown = describeThrown(error)
        failure = `${thrown.name}: ${thrown.message}`
        crashed = true
      }
    } finally {
      await teardown(containers)
    }
    outcomes.push({
      fixture: name,
      claim: claim.id,
      rule: claim.rule,
      says: claim.says,
      failure,
      crashed,
    })
  }

  if (claims.length === 0) {
    outcomes.push({
      fixture: name,
      claim: "<empty>",
      rule: "<none>",
      says: "the fixture declares at least one claim",
      failure: "the fixture exports no claims, so it pins nothing",
      crashed: true,
    })
  }

  return { fixture: name, rules, outcomes }
}

// ---------------------------------------------------------------------------
// the rule IDs SEMANTICS.md actually defines
// ---------------------------------------------------------------------------

const HEADING_RULE = /^#{2,4}\s+([A-Z]\d+(?:\.\d+)?)\s+—/gm
const BOLD_RULE = /\*\*([A-Z]\d+(?:\.\d+)?)(?:\.\*\*|\s+—)/g
/** A §13 index row, including the ranges it writes as `O3.1–3`. */
const INDEX_ROW = /^\|\s*([A-Z]\d+(?:\.\d+)?(?:–\d+)?)\s*\|/gm

/**
 * The `**Status.**` line of every rule section, by rule ID.
 *
 * §0.2 makes a status a claim about an OBSERVATION — `HOLDS` means the
 * falsification procedure was run and did not falsify, `VIOLATED` means it did.
 * Nothing checked that, so the document went on recording O2, X1, X2, X3, C6
 * and E2.1 as `VIOLATED` through three rounds in which their pinning fixtures
 * passed, and each round's report truthfully said "rules moved: NONE".
 *
 * A status is read as the FIRST keyword on the line. A rule whose status is
 * split across channels ("`HOLDS` for the throw, `PLANNED` (M2) for the stack")
 * reads as the weaker of the two, which is the reading that cannot silently
 * over-claim.
 */
export function documentedStatus(doc = readFileSync(SEMANTICS_DOC, "utf8")): Map<string, string> {
  const out = new Map<string, string>()
  const lines = doc.split("\n")
  let current: string | null = null
  let section: string | null = null

  /** The first keyword wins; a `VIOLATED`/`PLANNED` anywhere on the line beats it. */
  const record = (rules: string[], line: string, word: string): void => {
    const weaker = /`(VIOLATED|PLANNED)`/.exec(line)
    for (const rule of rules) out.set(rule, weaker ? weaker[1]! : word)
  }

  /** `O3.1–O3.3` and `O3.1–3` are one cell naming three rules. */
  const expand = (text: string): string[] | null => {
    const range = /^([A-Z]\d+)\.(\d+)\s*–\s*(?:[A-Z]\d+\.)?(\d+)$/.exec(text.trim())
    if (range) {
      const ids: string[] = []
      for (let n = Number(range[2]); n <= Number(range[3]); n++) ids.push(`${range[1]}.${n}`)
      return ids
    }
    return /^[A-Z]\d+(\.\d+)?$/.test(text.trim()) ? [text.trim()] : null
  }

  for (const line of lines) {
    const heading = /^###\s+([A-Z]\d+(?:\.\d+)?)\s+—/.exec(line)
    if (heading) {
      current = heading[1]!
      section = heading[1]!
      continue
    }
    // Both spellings a sub-rule is written in: `**O3.6.** …` and
    // `**O3.7 — the leak invariant.**`. Only the first was recognised, so O3.7
    // and E2.2 — the two rules M5 moved — had no prose status at all, and both
    // consistency tests below `continue`d past the gap in silence.
    const sub = /^\*\*([A-Z]\d+\.\d+)(?:\.|\s+—)\s/.exec(line)
    if (sub) {
      current = sub[1]!
      continue
    }
    // A sub-rule whose status is its own paragraph inside the section's
    // `**Status.**` block — `O3.7 \`HOLDS\` since M5.`, `O3.6 \`PARTIAL\`.` —
    // which is how every multi-sub-rule section in the document writes them.
    const own =
      /^\*{0,2}([A-Z]\d+\.\d+(?:\s*–\s*(?:[A-Z]\d+\.)?\d+)?)\*{0,2}\s+`([A-Z][A-Z, ]*)`/.exec(line)
    if (own) {
      const rules = expand(own[1]!)
      if (rules !== null) record(rules, line, own[2]!.split(",")[0]!.trim())
      continue
    }
    const status = /^\*\*Status\.\*\*\s*(.*)$/.exec(line)
    if (status === null) continue
    // `**Status.** O3.1–O3.3 \`HOLDS\`` names the rules it is about; anything
    // else is about whatever heading or sub-rule marker preceded it.
    const named = /^([A-Z]\d+\.\d+\s*–\s*(?:[A-Z]\d+\.)?\d+|[A-Z]\d+(?:\.\d+)?)\s+`/.exec(
      status[1]!,
    )
    const word = /`?([A-Z]+)/.exec(named ? status[1]!.slice(named[1]!.length).trim() : status[1]!)
    if (word === null) continue
    // An unnamed `**Status.**` is the SECTION's, and the document writes it
    // after the last sub-rule marker — so it is both. Recording only the marker
    // left `C5` unreadable while `C5.2` carried the section's word.
    const rules = named
      ? expand(named[1]!)
      : [...new Set([current, section].filter((id): id is string => id !== null))]
    if (rules === null || rules.length === 0) continue
    record(rules, line, word[1]!)
    current = null
  }
  return out
}

/**
 * Every rule ID `SEMANTICS.md` defines, from all three places it writes one:
 * the section headings, the bold sub-rule markers inside a section, and the §13
 * index — which is the only one that carries `O3.1–3` as a range and therefore
 * the only one that has to be expanded.
 *
 * This is what makes §0.3's pinning bidirectional: an ID in a fixture's `rules`
 * that is not in here is a typo pinning nothing.
 */
export function documentedRules(doc = readFileSync(SEMANTICS_DOC, "utf8")): Set<string> {
  const ids = new Set<string>()
  for (const [, id] of doc.matchAll(HEADING_RULE)) ids.add(id)
  for (const [, id] of doc.matchAll(BOLD_RULE)) ids.add(id)
  for (const [, cell] of doc.matchAll(INDEX_ROW)) {
    const range = /^([A-Z]\d+)\.(\d+)–(\d+)$/.exec(cell)
    if (!range) {
      ids.add(cell)
      continue
    }
    const [, family, from, to] = range
    for (let n = Number(from); n <= Number(to); n++) ids.add(`${family}.${n}`)
  }
  return ids
}

/** A `` `name` `` in §13's fixture column, with whether it is marked *(new)*. */
export interface IndexedFixture {
  rule: string
  name: string
  isNew: boolean
}

const INDEX_LINE = /^\|\s*([A-Z]\d+(?:\.\d+)?(?:–\d+)?)\s*\|[^|]*\|[^|]*\|([^|]*)\|/gm
const INDEX_FIXTURE = /`([a-zA-Z0-9._-]+)`(\s*\*\(new\)\*)?/g

/**
 * Every fixture §13 names, per rule. The `*(new)*` marker is the one column a
 * reader uses to tell a pinned rule from an unpinned one, and nothing checked
 * it — six cells still carried the marker for fixtures that had been written.
 * A hand-maintained column that drifts is worse than no column: it reports
 * coverage that does not exist.
 */
export function indexedFixtures(doc = readFileSync(SEMANTICS_DOC, "utf8")): IndexedFixture[] {
  const out: IndexedFixture[] = []
  for (const [, rule, cell] of doc.matchAll(INDEX_LINE)) {
    for (const [, name, marker] of cell.matchAll(INDEX_FIXTURE)) {
      out.push({ rule, name, isNew: marker !== undefined })
    }
  }
  return out
}

const INDEX_STATUS = /^\|\s*([A-Z]\d+(?:\.\d+)?(?:–\d+)?)\s*\|[^|]*\|([^|]*)\|/gm

/** The letter §13's legend gives each prose status word. */
export const STATUS_LETTER: Readonly<Record<string, string>> = Object.freeze({
  HOLDS: "H",
  VIOLATED: "V",
  PLANNED: "P",
  PARTIAL: "P",
  // O3.4's word. `I/U` is the cell it has carried since M2 — implemented, and
  // unexercised because nothing in the runtime calls `abortSignal` yet.
  IMPLEMENTED: "I",
  UNOBSERVABLE: "U",
})

/**
 * §13's Status column, per rule. Scoped to §13 by hand because §14's channel
 * table has the same row shape and a different third column.
 *
 * The column and the prose `**Status.**` lines are two hand-maintained records
 * of one fact and they drifted in 18 of 82 rows, including the ownership spine:
 * a reader consulting the document's own summary was told O2, C6 and X1 were
 * VIOLATED long after all three held.
 */
export function indexedStatuses(doc = readFileSync(SEMANTICS_DOC, "utf8")): Map<string, string> {
  const from = doc.indexOf("\n## 13.")
  if (from === -1) return new Map()
  const rest = doc.slice(from + 1)
  const to = rest.indexOf("\n## ")
  const section = to === -1 ? rest : rest.slice(0, to)
  const out = new Map<string, string>()
  for (const [, rule, status] of section.matchAll(INDEX_STATUS)) out.set(rule, status.trim())
  return out
}

/**
 * A rule ID as a standalone token. `includes("O2")` is satisfied by `O2.1`, and
 * the two are different rules with different statuses — conflating them is
 * exactly what §15.2's third assertion exists to prevent.
 */
export function namesRule(message: string, rule: string): boolean {
  const escaped = rule.replace(/\./g, "\\.")
  return new RegExp(`(?<![A-Za-z0-9.])${escaped}(?![0-9.])`).test(message)
}
