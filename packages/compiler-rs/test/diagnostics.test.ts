import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compileFixtureRaw,
  compileSourceRaw,
  listFixtures,
  nativeCompiler as native,
} from "./harness.ts";

const PACKAGE_ROOT = join(import.meta.dir, "..");

interface Diagnostic {
  code?: string;
  severity: "note" | "warning" | "error";
  message: string;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  pos: number;
  end: number;
  docs?: string;
}

interface Raw {
  code: string;
  warnings: string[];
  diagnostics: Diagnostic[];
  labels: { template: string; component?: string; line: number; column: number }[];
}

function diagnose(source: string, options: Record<string, unknown> = {}): Raw {
  return compileSourceRaw(source, "App.tsx", { dev: true, ...options }) as unknown as Raw;
}

function codes(raw: Raw): string[] {
  return raw.diagnostics.map((diagnostic) => diagnostic.code ?? "");
}

const COERCED =
  `import { signal } from "@barqjs/core";\n` +
  `const count = signal(0);\n` +
  "export const V = () => <p>{`total: ${count}`}</p>;\n";

describe("the diagnostic engine", () => {
  /**
   * The whole deliverable in one assertion: a code, a real severity, and a span
   * that is still a SPAN on this side of the napi boundary. `warnings` used to be
   * `Array<string>` and the byte offset Rollup's `position` wants was dropped at
   * the boundary, which is why no code frame existed anywhere, in any mode.
   */
  it("carries code, severity and a byte span across the napi boundary", () => {
    const raw = diagnose(COERCED);
    expect(codes(raw)).toEqual(["BARQ001"]);
    const [diagnostic] = raw.diagnostics;
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.file).toBe("App.tsx");
    expect(diagnostic.line).toBe(3);
    expect(COERCED.slice(diagnostic.pos, diagnostic.end)).toBe("count");
    expect(diagnostic.docs).toEndWith("/docs/BARQ001.md");
    expect(raw.warnings[0]).toContain("BARQ001 warning:");
  });

  it("is off by default and on in dev", () => {
    expect(compileSourceRaw(COERCED, "App.tsx").warnings).toEqual([]);
    expect(diagnose(COERCED, { dev: false, diagnostics: true }).diagnostics).toHaveLength(1);
  });

  /**
   * `` `${count}` `` and `-count` are the two the ROADMAP names as the cases
   * NOTHING else in the toolchain catches — `tsc --strict` reports zero errors on
   * either. Both name the symbol and print the fix.
   */
  it("names the symbol and prints the fix for the two cases nothing else catches", () => {
    for (const [expression, code] of [
      ["`${count}`", "BARQ001"],
      ["-count", "BARQ001"],
    ] as const) {
      const raw = diagnose(
        `import { signal } from "@barqjs/core";\n` +
          `const count = signal(0);\n` +
          `export const V = () => <p>{${expression}}</p>;\n`,
      );
      expect(codes(raw)).toEqual([code]);
      expect(raw.diagnostics[0].message).toContain("`count`");
      expect(raw.diagnostics[0].message).toContain("`count()`");
    }
  });

  /** The framework's own idiom. A JSX arm here would fire on correct code. */
  it("says nothing about a bare accessor in a JSX hole or attribute", () => {
    const raw = diagnose(
      `import { signal } from "@barqjs/core";\n` +
        `const count = signal(0);\n` +
        "export const V = () => <div id={count}>{count}</div>;\n",
    );
    expect(raw.diagnostics).toEqual([]);

    // The positive control, in the same shape and the same file: without it,
    // this assertion cannot tell "the JSX arm is correctly absent" from "the
    // rule is switched off".
    const armed = diagnose(
      `import { signal } from "@barqjs/core";\n` +
        `const count = signal(0);\n` +
        "export const V = () => <div id={count}>{`${count}`}</div>;\n",
    );
    expect(codes(armed)).toEqual(["BARQ001"]);
  });

  it("silences a diagnostic per code and per span, and reports a stale directive", () => {
    const silenced = COERCED.replace(
      "export const V",
      "// barq-ignore-next-line BARQ001 (this panel wants the source text)\nexport const V",
    );
    expect(diagnose(silenced).diagnostics).toEqual([]);

    // A directive naming a different code silences nothing — naming the code is
    // what stops one suppression swallowing an unrelated diagnostic.
    expect(codes(diagnose(silenced.replace("BARQ001", "BARQ005")))).toEqual(["BARQ008", "BARQ001"]);

    // Unused: reported, at warning level, even with defaultCategory error.
    const stale =
      "// barq-ignore-next-line BARQ001 (nothing reports this now)\nexport const V = () => <p>ok</p>;\n";
    const raw = diagnose(stale, { defaultCategory: "error" });
    expect(codes(raw)).toEqual(["BARQ008"]);
    expect(raw.diagnostics[0].severity).toBe("warning");
  });

  it("resolves severity from one shared map", () => {
    expect(diagnose(COERCED, { checks: [["BARQ001", "suppress"]] }).diagnostics).toEqual([]);
    expect(diagnose(COERCED, { checks: [["BARQ001", "note"]] }).diagnostics[0].severity).toBe(
      "note",
    );
    expect(diagnose(COERCED, { defaultCategory: "error" }).diagnostics[0].severity).toBe("error");
    // An unreadable entry is reported rather than guessed at.
    expect(diagnose(COERCED, { checks: [["BARQ999", "warning"]] }).warnings.join("\n")).toContain(
      "BARQ999",
    );
  });

  it("emits nothing coded for vendored or generated code", () => {
    for (const file of ["/x/node_modules/y/a.tsx", "virtual:barq.tsx"]) {
      const raw = compileSourceRaw(COERCED, file, { dev: true }) as unknown as Raw;
      expect(raw.diagnostics).toEqual([]);
    }
    // The identical source under a path the author owns DOES report, which is
    // what makes the three silences above a measurement.
    const owned = compileSourceRaw(COERCED, "/x/src/a.tsx", { dev: true }) as unknown as Raw;
    expect(codes(owned)).toEqual(["BARQ001"]);
  });

  it("labels every hoisted template with its component and source position", () => {
    const raw = diagnose(
      'function Chip(props) { return <b class="c">{props.text}</b>; }\n' +
        "export default function Page() {\n" +
        '  return <div class="page"><Chip text="a"/></div>;\n' +
        "}\n",
    );
    expect(raw.labels.map((label) => label.component).toSorted()).toEqual(["Chip", "Page"]);
    for (const label of raw.labels) {
      expect(raw.code).toContain(label.template);
      expect(label.line).toBeGreaterThan(0);
    }
    expect((compileSourceRaw(COERCED, "App.tsx") as unknown as Raw).labels).toEqual([]);
  });

  /**
   * Codes are a public API — an ignore comment in user code is a call into this
   * table. Svelte 5 renamed every code and silently invalidated every
   * `svelte-ignore` in every codebase (sveltejs/svelte#11414).
   */
  it("publishes one code table, and every code in it has a docs page", () => {
    const table = native.diagnosticCodes();
    expect(table.length).toBeGreaterThan(0);
    const index = readFileSync(join(PACKAGE_ROOT, "docs/README.md"), "utf8");
    for (const entry of table) {
      expect(entry.code).toMatch(/^BARQ\d{3}$/);
      expect(["note", "warning", "error"]).toContain(entry.level);
      // The consumer is handed a URL — a package-relative path resolves from
      // nowhere once the package is installed — and the page it names ships
      // inside the package at the same trailing path.
      expect(entry.docs).toStartWith("https://");
      expect(entry.docs).toEndWith(`/docs/${entry.code}.md`);
      expect(existsSync(join(PACKAGE_ROOT, "docs", `${entry.code}.md`))).toBe(true);
      expect(index).toContain(entry.code);
    }
    expect(new Set(table.map((entry) => entry.code)).size).toBe(table.length);
  });

  /**
   * A code nothing can produce is a ghost in a published API: `barq-ignore-next-line
   * BARQ006` went on parsing, went on suppressing nothing, and went on being
   * advertised by `diagnosticCodes()` for a rule the compiler had stopped
   * emitting. BARQ006 is how that was found — M3 deleted DESIGN O7 with the
   * getters its premise was about, and only a plugin test that used it as a
   * PROBE noticed. This is the assertion that would have noticed instead.
   *
   * One source per advertised code, each of which must produce exactly that
   * code. A code with no source here fails the first expectation, so silencing
   * a rule without deleting its variant is a red test rather than a ghost.
   */
  it("every advertised code is reachable from some input", () => {
    type Reachable = string | { source: string; options: Record<string, unknown> };
    const reachable: Record<string, Reachable> = {
      BARQ001:
        `import { signal } from "@barqjs/core";\n` +
        `const count = signal(0);\n` +
        "export const V = () => <p>{`total: ${count}`}</p>;\n",
      BARQ002:
        `import { signal } from "@barqjs/core";\n` +
        `const on = signal(false);\n` +
        'export const V = () => <p>{on ? "y" : "n"}</p>;\n',
      BARQ003:
        `import { signal } from "@barqjs/core";\n` +
        `const user = signal({ email: \"a\" });\n` +
        "export const V = () => <p>{user.email}</p>;\n",
      BARQ004:
        `import { For, useStore } from "@barqjs/core";\n` +
        `const [state] = useStore({ rows: [] });\n` +
        "export const V = () => <For each={state.rows}>{(row) => <li>{row.name}</li>}</For>;\n",
      BARQ005: "export const V = ({ text }) => <p>{text}</p>;\n",
      BARQ008:
        "// barq-ignore-next-line BARQ001 (nothing reports this here)\n" +
        "export const V = () => <p>ok</p>;\n",
      BARQ009: "// barq-ignore-next-line\nexport const V = () => <p>ok</p>;\n",
      BARQ010:
        "function Sink(props) { return <div title={props.children} />; }\n" +
        "export const V = () => <Sink><b>x</b></Sink>;\n",
      BARQ011:
        `import { For, signal } from "@barqjs/core";\n` +
        "const rows = signal([]);\n" +
        "export const V = () =>\n" +
        "  <For each={rows} keyed={false}>{(row) => <li><input value={row()} /></li>}</For>;\n",
      BARQ012:
        `import { createServerFn } from "@barqjs/start";\n` +
        "export const save = createServerFn().handler(async () => 1);\n" +
        "export const V = () => <p>ok</p>;\n",
      // The only code so far that needs an OPTION to be reachable at all: the
      // route set is a whole-project fact, and absent it the check is off by
      // design so a project without a table is never warned.
      BARQ013: {
        source:
          `import { Link } from "@barqjs/router";\n` +
          `export const V = () => <Link to="/user/7">go</Link>;\n`,
        options: { routes: ["/", "/users/$id"] },
      },
    };

    const advertised = native
      .diagnosticCodes()
      .map((entry) => entry.code)
      .sort();
    expect(
      advertised.filter((code) => reachable[code] === undefined),
      "an advertised code with no input that produces it",
    ).toEqual([]);
    expect(
      Object.keys(reachable)
        .filter((code) => !advertised.includes(code))
        .sort(),
      "a source for a code the table no longer advertises",
    ).toEqual([]);

    for (const code of advertised) {
      const entry = reachable[code]!;
      const source = typeof entry === "string" ? entry : entry.source;
      const options = typeof entry === "string" ? {} : entry.options;
      expect(codes(diagnose(source, options)), `${code} is unreachable`).toContain(code);
    }
  });

  /**
   * Precision, measured against the whole corpus rather than asserted. Two hits
   * in 117 fixtures, and both are known:
   *
   * - `diagnostic-accessor-coercion` is the positive fixture, added for this.
   * - `props-destructured-param` is the false-positive class BARQ005 documents
   *   and accepts — `solid/no-destructure` accepts the same one and has zero
   *   false-positive issues in its tracker.
   *
   * D1 fires on ZERO of the 116 fixtures that predate it, and on zero of the 71
   * real `.ts`/`.tsx` files in this repo's own packages beyond the four genuine
   * bugs recorded in `docs/BARQ001.md`'s own measurement.
   */
  it("fires on exactly two fixtures in the corpus, and both are documented", () => {
    const hits: string[] = [];
    for (const name of listFixtures()) {
      const raw = compileFixtureRaw(name, { dev: true }) as unknown as Raw;
      for (const diagnostic of raw.diagnostics) hits.push(`${name}:${diagnostic.code}`);
    }
    expect(hits).toEqual([
      "diagnostic-accessor-coercion:BARQ001",
      "props-destructured-param:BARQ005",
    ]);
  });

  /**
   * C5.1 item 1 at the slots the compiler knows most precisely. `each`, `when`
   * and `target` are Cell arguments of the primitive the construct lowers to,
   * exactly as an attribute on an intrinsic element is, and the runtime answers
   * a Block in one with the same `ScopeMissingError` — so a compile-time fact
   * was being discovered at run time. The M7 gate found them silent.
   *
   * The bounds are asserted beside them, because C5.1 states them and a bound
   * nothing measures drifts: a spread ends the chain, a Block slot (`children`)
   * is not one, and a value aliased through a local is invisible to the pass.
   */
  it("names a Block forwarded into a flow construct's Cell slot", () => {
    const each =
      'import { For } from "@barqjs/core";\n' +
      "function Rows(props) { return <For each={props.thing}>{(row) => <li>{row}</li>}</For>; }\n" +
      "export const V = () => <Rows thing={<b>x</b>} />;\n";
    const raw = diagnose(each);
    expect(codes(raw)).toContain("BARQ010");
    const named = raw.diagnostics.find((entry) => entry.code === "BARQ010")!;
    expect(named.message).toContain("each source");
    expect(named.message).not.toContain("intrinsic element");

    const when =
      'import { Show } from "@barqjs/core";\n' +
      "function Gate(props) { return <Show when={props.thing}>ok</Show>; }\n" +
      "export const V = () => <Gate thing={<b>x</b>} />;\n";
    expect(codes(diagnose(when))).toContain("BARQ010");

    const target =
      'import { Portal } from "@barqjs/core";\n' +
      "function Away(props) { return <Portal mount={props.thing}>ok</Portal>; }\n" +
      "export const V = () => <Away thing={<b>x</b>} />;\n";
    expect(codes(diagnose(target))).toContain("BARQ010");

    // A BLOCK slot on the same construct is not a Cell slot and must stay
    // silent: `fallback` is built, not read.
    const fallback =
      'import { For } from "@barqjs/core";\n' +
      "function Rows(props) { return <For each={[]} fallback={props.thing}>{(row) => <li>{row}</li>}</For>; }\n" +
      "export const V = () => <Rows thing={<b>x</b>} />;\n";
    expect(codes(diagnose(fallback))).not.toContain("BARQ010");

    // C5.1's declared bound, measured rather than assumed: a spread names no
    // key, so it ends the fixpoint's chain. Item 2 still fires at run time.
    const spread =
      'import { For } from "@barqjs/core";\n' +
      "function Rows(props) { return <For each={props.thing}>{(row) => <li>{row}</li>}</For>; }\n" +
      "export const V = () => <Rows {...{ thing: <b>x</b> }} />;\n";
    expect(codes(diagnose(spread))).not.toContain("BARQ010");
  });

  /**
   * A `barq-ignore` must never influence codegen. The React Compiler treated the
   * mere PRESENCE of an `eslint-disable` as grounds to bail out of optimising a
   * component (facebook/react#34261).
   */
  it("cannot change the emitted code", () => {
    const plain = 'export const V = () => <p class="a">x</p>;\n';
    const ignored = `// barq-ignore-next-line BARQ001 (must change nothing)\n${plain}`;
    const stripped = diagnose(ignored)
      .code.split("\n")
      .filter((line) => !line.includes("barq-ignore"))
      .join("\n");
    expect(stripped.trim()).toBe(diagnose(plain).code.trim());

    // The positive control: on a module the directive really does silence, the
    // emitted bytes are still the ones the un-suppressed module produces. A
    // directive that silenced nothing would satisfy the assertion above on its
    // own.
    const silenced = COERCED.replace(
      "export const V",
      "// barq-ignore-next-line BARQ001 (this panel wants the source text)\nexport const V",
    );
    const suppressed = diagnose(silenced);
    expect(suppressed.diagnostics).toEqual([]);
    expect(codes(diagnose(COERCED))).toEqual(["BARQ001"]);
    expect(
      suppressed.code
        .split("\n")
        .filter((line) => !line.includes("barq-ignore"))
        .join("\n")
        .trim(),
    ).toBe(diagnose(COERCED).code.trim());
  });
});

/**
 * BARQ013's precision, which is the whole of whether it is usable.
 *
 * A link check that guesses is a link check people turn off, so every case it
 * declines is as load-bearing as the one it fires on — and each is here rather
 * than described in the docs page alone.
 */
describe("BARQ013 — `<Link to>` against the route table", () => {
  const routes = ["/", "/users/$id", "/files/$"];
  const link = (to: string, from = "@barqjs/router", name = "Link") =>
    `import { ${name} } from "${from}";\n` +
    `export const V = () => <${name} to=${to}>go</${name}>;\n`;

  const fires = (source: string, options: Record<string, unknown> = { routes }) =>
    codes(diagnose(source, options)).includes("BARQ013");

  it("fires on a literal no route matches", () => {
    expect(fires(link('"/user/7"'))).toBe(true);
  });

  it("is quiet on one that matches, including the pattern itself", () => {
    // `<Link to="/users/$id" params={{ id }}>` is the checked form, so the
    // pattern has to match itself or the good shape warns.
    expect(fires(link('"/users/7"'))).toBe(false);
    expect(fires(link('"/users/$id"'))).toBe(false);
    expect(fires(link('"/files/a/b"'))).toBe(false);
  });

  it("checks NavLink, and an aliased import", () => {
    expect(fires(link('"/nope"', "@barqjs/router", "NavLink"))).toBe(true);
    expect(
      fires(
        `import { Link as Anchor } from "@barqjs/router";\n` +
          `export const V = () => <Anchor to="/nope">go</Anchor>;\n`,
      ),
    ).toBe(true);
  });

  it("does NOT check someone else's component named Link", () => {
    // Resolution is by `SymbolId` against `routerSource`, not by name.
    expect(fires(link('"/nope"', "./my-link.ts"))).toBe(false);
  });

  it("declines what it cannot know", () => {
    // A value, a relative path, something that leaves the app.
    expect(
      fires(
        `import { Link } from "@barqjs/router";\n` +
          `const p = "/nope";\n` +
          `export const V = () => <Link to={p}>go</Link>;\n`,
      ),
    ).toBe(false);
    expect(fires(link('"edit"'))).toBe(false);
    expect(fires(link('"https://x.com/nope"'))).toBe(false);
    expect(fires(link('"#top"'))).toBe(false);
  });

  it("is off entirely without a route table", () => {
    // A project with a hand-written table and no build integration must never
    // be warned about every link it writes.
    expect(fires(link('"/nope"'), {})).toBe(false);
  });

  it("runs without `dev`, so it can fail a build", () => {
    // `bind`'s rules are gated on `diagnostics`, which defaults to `dev`. This
    // one is raised from the driver precisely so CI sees it.
    expect(codes(compileSourceRaw(link('"/nope"'), "App.tsx", { routes }) as never)).toContain(
      "BARQ013",
    );
  });
});
