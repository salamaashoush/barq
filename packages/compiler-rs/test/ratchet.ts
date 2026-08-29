/**
 * The parity ratchet, generalised — `CODESIGN.md` §12, adopted from Solid's
 * `parity.test.js`.
 *
 * Their rule, in their words:
 *
 *   "An ABSENT expectation file means the compilers are at parity and must stay
 *    there. A PRESENT expectation file documents the current known divergence.
 *    Any change — regression OR IMPROVEMENT — fails until the expectation is
 *    regenerated."
 *
 * This project's three registries already have the two easy halves. An
 * unregistered failure is a suite failure, and a registered failure that stops
 * failing is reported as stale. What none of them has is the third: a
 * registered failure whose SHAPE CHANGED while it went on failing. That is how
 * a row rots, and this table has a live example of the shape:
 *
 *   C3.8 — "4 of the 18 (shape, slot) pairs still take a Block without
 *   throwing", naming all four.
 *
 * Fix two of the four and the claim still fails, still names C3.8, and every
 * assertion in `semantics.test.ts` stays green. The registry goes on saying
 * "4 of 18" and the reason text goes on proposing a fix for slots that are no
 * longer broken, until someone eventually reads the row and believes it. The
 * improvement is invisible, which is precisely Solid's point: failing on
 * improvement is not pedantry, it is the only thing that keeps a row's TEXT
 * attached to an observation.
 *
 * ## What a digest is over
 *
 * The observation the channel produced, verbatim, normalised for the two things
 * that legitimately vary between machines: absolute paths and whitespace. Every
 * number inside it is signal — "4 of 18", "0 of its cleanups", "1 more
 * effect(s)" — and changing any of them is what has to fail.
 *
 * ## Regenerating
 *
 * `BARQ_RATCHET=print bun test` prints the literal each stale row should carry.
 * Copying it into the registry is a diff, which is the point: the row's prose
 * is re-read in the same change that moves its digest.
 */
import { createHash } from "node:crypto";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

/**
 * The digest of one observation.
 *
 * Twelve hex characters. Long enough that two different observations will not
 * collide across a corpus this size, short enough to read in a diff and to
 * retype from a failure message.
 */
export function digest(observation: string): string {
  const normalised = observation.replaceAll(REPO, "<repo>").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised).digest("hex").slice(0, 12);
}

/** Set by `BARQ_RATCHET=print`: collect the regenerated literals and print them. */
export const PRINTING = process.env.BARQ_RATCHET === "print";

const PRINTED: string[] = [];

export function recordRegeneration(line: string): void {
  PRINTED.push(line);
}

export function regenerationReport(): string {
  if (PRINTED.length === 0) return "";
  return (
    "\nBARQ_RATCHET=print — the digests these rows should carry:\n" +
    PRINTED.map((line) => `  ${line}`).join("\n") +
    "\n"
  );
}

export interface RatchetInput {
  /** How the row is addressed, for the failure message. */
  key: string;
  /** What the registry says the observation is, or `undefined` on an old row. */
  expected: string | undefined;
  /** What the channel just observed. */
  observed: string;
  /** The registry file a reader has to open. */
  file: string;
}

/**
 * `null` when the observation is the one the row was written against, and the
 * message the suite prints when it is not.
 *
 * A row with no digest is NOT accepted. An un-ratcheted row is a row that can
 * rot, and every row in the three registries carries one.
 */
export function ratchet({ key, expected, observed, file }: RatchetInput): string | null {
  const now = digest(observed);
  if (expected === now) return null;
  if (PRINTING) recordRegeneration(`${key}  observed: "${now}"`);
  if (expected === undefined) {
    return (
      `NO RATCHET: ${key} is registered but carries no \`observed\` digest.\n` +
      `  The observation is:\n    ${observed}\n` +
      `  Add \`observed: "${now}"\` to its row in ${file}. A row without one can be fixed ` +
      `halfway\n  and go on reading as if nothing had changed.\n`
    );
  }
  return (
    `RATCHET: ${key} still fails, and it fails DIFFERENTLY.\n` +
    `  registered digest ${expected}\n` +
    `  observed digest   ${now}\n` +
    `  the observation now reads:\n    ${observed}\n` +
    `  This fails whether the change is a regression or an IMPROVEMENT, which is the whole ` +
    `point:\n  a row whose text no longer describes what happens is a row nobody can review. ` +
    `Re-read the\n  row in ${file}, rewrite its reason to match, and set ` +
    `\`observed: "${now}"\`.\n`
  );
}

/**
 * The same idea one level up: a channel's REACH.
 *
 * An empty registry asserts "no findings", and that assertion is only worth
 * something if the channel still looks at as much as it did. A probe that
 * stopped discriminating reports zero findings and reads exactly like a fixed
 * codebase — the failure mode `ownership-known-failures.ts` names in its own
 * assertion 1, seen from outside any individual row. So the census each channel
 * already prints is pinned, and it fails in BOTH directions: fewer sessions is
 * a blinded oracle, more is a corpus that grew without anyone re-reading what
 * the channel now covers.
 */
export interface ReachInput {
  channel: string;
  expected: Readonly<Record<string, number>>;
  observed: Readonly<Record<string, number>>;
  file: string;
}

export function reachRatchet({ channel, expected, observed, file }: ReachInput): string | null {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(observed)])].sort();
  const drifted = keys.filter((key) => expected[key] !== observed[key]);
  if (drifted.length === 0) return null;
  if (PRINTING) {
    recordRegeneration(`${channel} reach: ${JSON.stringify(observed)}`);
  }
  const lines = drifted.map(
    (key) =>
      `    ${key}: pinned ${expected[key] ?? "(absent)"} — observed ${observed[key] ?? "(absent)"}`,
  );
  return (
    `REACH: the ${channel} channel does not cover what it is pinned to cover.\n` +
    lines.join("\n") +
    `\n  A channel that looks at less reports fewer findings and reads exactly like a fixed ` +
    `codebase.\n  A channel that looks at more has grown coverage nobody has reviewed. Both fail ` +
    `here.\n  Update the pin in ${file} in the same change, and say in its text what moved.\n`
  );
}
