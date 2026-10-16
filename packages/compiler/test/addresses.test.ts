import { describe, expect, it } from "bun:test";

import { ADDRESS_CHANNEL_RULES } from "./addresses.ts";
import { compileFixtureRaw, listFixtures } from "./harness.ts";

/**
 * P6, the compile-time address table.
 *
 * The acceptance criterion is that the whole corpus compiles both ways and the
 * address sets diff clean. This is that fixture.
 *
 * WHY IT IS WORTH A CHANNEL OF ITS OWN. The two backends share the front end and
 * four of the passes and disagree about three: `anchor` inserts marker nodes for
 * the DOM target and not for the string one, `serialize` writes template bytes
 * only one of them has, and the ref walk is a DOM concept outright. So a
 * `NodeId` means two different things on the two targets, and any address built
 * out of one would agree by luck. The table is built out of the patch program
 * instead, which both targets compute identically — and this suite is what says
 * "identically" rather than assuming it.
 *
 * The addresses are also asserted STABLE across `-O0`, because the whole
 * claim is that the two levels are one program at two speeds. An address that
 * moved when effect fusion was turned off would be an address about the
 * compiler's mood.
 */

const CORPUS = listFixtures();

interface Table {
  version: number;
  module: string;
  positions: Array<{ at: string; kind: string; key: number; start: number; end: number }>;
}

function table(name: string, options: Record<string, unknown> = {}): Table {
  const raw = compileFixtureRaw(name, { addresses: true, ...options });
  const json = raw.addresses;
  if (json === undefined || json === null) {
    throw new Error(`${name}: the build has no \`addresses\` option — P6 has not landed`);
  }
  return JSON.parse(json) as Table;
}

/** The comparable identity: where, what, and which key. Spans are compared too —
 * a position that addresses different JSX on the two targets is the same defect
 * as one that is missing. */
function rows(it: Table): string[] {
  return it.positions.map((p) => `${p.at} ${p.kind} ${p.key} ${p.start}-${p.end}`);
}

describe("compile-time addresses", () => {
  it("declares the rule it reports on", () => {
    // H5 names this channel, and `semantics.test.ts` computes
    // the oracle's coverage from the same constant — so a channel that stopped
    // reporting a rule and a document that stopped claiming one cannot drift.
    expect([...ADDRESS_CHANNEL_RULES]).toEqual(["H5"]);
  });

  it("the option exists and produces a table", () => {
    // Detection, not declaration — the same discipline `ssr.ts` applies to the
    // string backend. A build without the option must fail here rather than let
    // every comparison below pass vacuously.
    const one = table(CORPUS[0]!);
    expect(one.version).toBe(1);
    expect(one.module).toBe(`${CORPUS[0]}.tsx`);
  });

  it("the DOM and the string backend address exactly the same positions", () => {
    const moved: string[] = [];
    let addressed = 0;
    for (const name of CORPUS) {
      const dom = rows(table(name));
      const ssr = rows(table(name, { ssr: true }));
      addressed += dom.length;
      if (dom.join("\n") !== ssr.join("\n")) moved.push(name);
    }
    expect(moved, "a fixture's address set depends on the backend").toEqual([]);
    // A lower bound, so a compiler that addressed NOTHING could not satisfy the
    // agreement above by having nothing to disagree about.
    expect(addressed, "the corpus barely addresses anything").toBeGreaterThan(250);
  });

  it("the two backends agree at -O0 as well as at -Ox", () => {
    // The agreement is the property, and it has to hold on the axis L3 uses.
    // Checking only the default level would leave the two backends free to
    // disagree in exactly the configuration the differential runs them in.
    const moved: string[] = [];
    for (const name of CORPUS) {
      const dom = rows(table(name, { optimize: 0 }));
      const ssr = rows(table(name, { optimize: 0, ssr: true }));
      if (dom.join("\n") !== ssr.join("\n")) moved.push(name);
    }
    expect(moved, "a fixture's -O0 address set depends on the backend").toEqual([]);
  });

  /**
   * What an address is NOT stable under, measured rather than assumed.
   *
   * `-O0` addresses a SUPERSET of the positions `-Ox` does, and the difference
   * is P3 fold: a `SetOnce` whose value is a proven constant becomes template
   * bytes, and bytes have no position to claim at run time — there is nothing
   * there for a client to write to, so an address for it would name a hole that
   * does not exist. That is a real semantic difference between the two builds
   * and not a stability defect, and it is fine for every consumer of the table,
   * because a server and its client are ONE build with ONE set of flags.
   *
   * It is pinned here so that the boundary is a measured fact. A version of this
   * that quietly became "the sets differ arbitrarily" would take hydration's
   * whole premise with it.
   */
  it("-O0 addresses a superset of -Ox, and folding is the whole difference", () => {
    const wrongDirection: string[] = [];
    let extra = 0;
    for (const name of CORPUS) {
      const ox = new Set(
        table(name).positions.map((p) => `${p.kind} ${p.key} ${p.start}-${p.end}`),
      );
      const o0 = table(name, { optimize: 0 }).positions.map(
        (p) => `${p.kind} ${p.key} ${p.start}-${p.end}`,
      );
      for (const row of ox) {
        if (!o0.includes(row)) wrongDirection.push(`${name}: ${row}`);
      }
      extra += o0.length - ox.size;
    }
    expect(wrongDirection, "-Ox addressed a position -O0 does not have").toEqual([]);
    expect(extra, "no fixture folds a position away, so this row measures nothing").toBeGreaterThan(
      0,
    );
  });

  it("an address is unique inside its module", () => {
    for (const name of CORPUS) {
      const at = table(name).positions.map((p) => p.at);
      expect(new Set(at).size, `${name} addressed one position twice`).toBe(at.length);
    }
  });

  it("asking for the table does not change the emitted code", () => {
    for (const name of CORPUS) {
      for (const options of [{}, { ssr: true }]) {
        const plain = compileFixtureRaw(name, options);
        const asked = compileFixtureRaw(name, { addresses: true, ...options });
        expect(asked.code, `${name} compiled differently when addressed`).toBe(plain.code);
      }
    }
  });
});
