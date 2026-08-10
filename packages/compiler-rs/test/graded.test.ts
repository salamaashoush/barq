/**
 * L4 — the grade table itself. `CODESIGN.md` §6 L4.
 *
 * `graded.ts` is a table, and a table is a comment unless something checks it.
 * These assertions are what make it an artefact: every channel §6 L4 names is
 * present, every grade is one of the six, every file a channel claims to live in
 * exists, every rule a channel claims to report is a documented rule, and the
 * number of exemptions the whole oracle honours is printed on every run.
 *
 * That last number is the point of the milestone. §6 L4's complaint is not that
 * barq's oracle is weak — it is that barq "applies near-total equality everywhere
 * and buys exceptions back", so the strength is unmeasurable. Counting the
 * exceptions makes it measurable, and the three regraded channels are asserted
 * to buy none.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "bun:test"

import { CHANNELS, channel, exemptionCount, L4_RULES, type Grade } from "./graded.ts"
import { documentedRules } from "./semantics.ts"

const GRADES: readonly Grade[] = [
  "differential",
  "metamorphic",
  "absolute",
  "self-check",
  "golden",
  "ungraded",
]

/** The seven channels `CODESIGN.md` §6 L4 tabulates, by the row it gives each. */
const SPEC_ROWS = [
  "rendered-dom",
  "node-identity",
  "effect-counts",
  "marker-layout",
  "anchor-position",
  "fused-golden",
]

const CRATE = join(import.meta.dir, "..")

console.log(
  `L4 grades: ${CHANNELS.length} channels — ` +
    CHANNELS.map((c) => `${c.id}:${c.grade}`).join(" ") +
    `\n  exemptions bought back across the whole table: ${exemptionCount()}`,
)

describe("L4 — the grade table", () => {
  it("carries every channel CODESIGN §6 L4 tabulates", () => {
    for (const id of SPEC_ROWS) expect(CHANNELS.map((c) => c.id)).toContain(id)
  })

  it("grades the three §6 L4 names explicitly", () => {
    // The document names a grade for each of these in as many words, and the
    // regrade is exactly these three cells. Hard-coded so a later edit to
    // `graded.ts` that silently downgrades one fails here.
    expect(channel("node-identity").grade).toBe("metamorphic")
    expect(channel("effect-counts").grade).toBe("absolute")
    expect(channel("marker-layout").grade).toBe("self-check")
    expect(channel("anchor-position").grade).toBe("ungraded")
    expect(channel("fused-golden").grade).toBe("golden")
    expect(channel("rendered-dom").grade).toBe("differential")
  })

  it("every channel has a grade from the six, and no id occurs twice", () => {
    const ids = CHANNELS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CHANNELS) expect(GRADES).toContain(c.grade)
  })

  it("every channel names where it lives, and those files exist", () => {
    const missing: string[] = []
    for (const c of CHANNELS) {
      expect(c.where.length, `${c.id} says nowhere`).toBeGreaterThan(0)
      for (const entry of c.where) {
        // Some entries name a function inside a file ("harness.ts boundEffects")
        // or a directory; the file is the first word either way.
        const file = entry.split(" ")[0]
        if (file.includes("§") || file.endsWith("/")) continue
        const candidates = [join(CRATE, "test", file), join(CRATE, file)]
        if (candidates.some((path) => existsSync(path))) continue
        missing.push(`${c.id}: ${entry}`)
      }
    }
    expect(missing.join("\n")).toBe("")
  })

  it("no file outside a channel's `where` emits that channel's id", () => {
    // The direction the existence check above cannot see. `where` said the
    // node-identity channel lived in `metamorphic.ts` and bought no exceptions,
    // while `harness.ts` and `browser-differential.ts` both pushed
    // `kind: "node-identity"` under a guard that switches the comparison off
    // exactly where the frames disagree — an exemption on a channel whose whole
    // claim was that it honours none. Existence is satisfied by one file; this
    // is satisfied only by all of them.
    const stray: string[] = []
    for (const c of CHANNELS) {
      const declared = c.where.map((entry) => entry.split(" ")[0])
      const needle = new RegExp(`kind:\\s*"${c.id}"`)
      for (const file of readdirSync(join(CRATE, "test"))) {
        if (!file.endsWith(".ts")) continue
        if (file === "graded.ts" || file === "graded.test.ts") continue
        if (!needle.test(readFileSync(join(CRATE, "test", file), "utf8"))) continue
        if (declared.includes(file)) continue
        stray.push(`${c.id} is emitted by ${file}, which its \`where\` does not name`)
      }
    }
    expect(
      stray.join("\n"),
      "a channel that reports from a file its own row does not name is a channel whose grade, " +
        "premise and exemption list describe somewhere else",
    ).toBe("")
  })

  it("every rule a channel claims to report is a documented rule", () => {
    const documented = documentedRules()
    const wrong: string[] = []
    for (const c of CHANNELS) {
      for (const rule of c.rules) {
        if (!documented.has(rule)) wrong.push(`${c.id}: ${rule} is not a rule in SEMANTICS.md`)
      }
    }
    expect(wrong.join("\n")).toBe("")
  })

  it("every channel states a premise, and only `ungraded` may state none", () => {
    for (const c of CHANNELS) {
      expect(c.premise.length, `${c.id} has no premise`).toBeGreaterThan(3)
      if (c.grade === "ungraded") continue
      // A premise that IS the frames being compared is the defect §6 L4 is
      // about, and the three regraded channels say so in their own words.
      expect(
        /identical|equal|agree/i.test(c.premise) && !/premise/i.test(c.premise) ? c.id : "",
        `${c.id}'s premise reads like an observation of the frames it is checking`,
      ).not.toBe(c.id)
    }
  })

  it("the three regraded channels buy no exceptions back at all", () => {
    // The whole claim of L4, stated as a number rather than as a paragraph.
    expect(channel("node-identity").exemptions).toEqual([])
    expect(channel("single-evaluation").exemptions).toEqual([])
    expect(channel("marker-layout").exemptions).toEqual([])
  })

  it("every exemption that IS honoured is named, with the mechanism that grants it", () => {
    // Five remain across the whole table, and none of them is anonymous. An
    // exemption nobody wrote down is the thing this file exists to prevent —
    // `compareToOracle`'s two `if (… !== …) continue` guards were exactly that.
    // The metamorphic regrade removed the identity channel's DEPENDENCE on the
    // first guard; it did not remove the guard, which is still live in
    // `harness.ts` and `browser-differential.ts`. That comparison is a separate
    // channel at a separate grade — `node-identity-differential` — and the count
    // went 4 -> 5 when it was written down. That is the number moving in the
    // honest direction: the exception was always bought, and now it is billed.
    const named = CHANNELS.flatMap((c) => c.exemptions)
    expect(named.length).toBe(exemptionCount())
    for (const entry of named) {
      expect(entry.length, `an exemption is named but not explained: ${entry}`).toBeGreaterThan(40)
      expect(entry, `${entry} names no mechanism`).toMatch(/\.ts|FixtureModule|—/)
    }
    expect(exemptionCount()).toBeLessThanOrEqual(5)
  })

  it("the L4 channels' declared reach is exactly what the three of them report", () => {
    expect([...L4_RULES].sort()).toEqual(["B4", "C7", "K2", "K6", "O3.5", "O3.7"])
  })
})
