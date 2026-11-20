/**
 * `barq check` against a project on disk: what it reports, what `--fix`
 * leaves behind, and what each form of the output says.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "bun:test";

import {
  applyFixes,
  check,
  codes,
  formatText,
  projectOptions,
  type CheckResult,
  type Paint,
} from "../src/check.ts";
import { main, parse } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../src/index.ts");
const made: string[] = [];

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "barq-check-")));
  made.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

const VIEW = `import { createContext, createSignal } from "@barqjs/core";
const Theme = createContext("light");
export function View() {
  const [count, setCount] = createSignal(0);
  return (
    <Theme.Provider value="dark">
      <button classList={{ on: count > 1 }} on:click={() => setCount(count() + 1)}>
        {count ? "some" : "none"} {count.length}
      </button>
    </Theme.Provider>
  );
}
`;

const REPAIRED = `import { createContext, createSignal } from "@barqjs/core";
const Theme = createContext("light");
export function View() {
  const [count, setCount] = createSignal(0);
  return (
    <Theme value="dark">
      <button class={{ on: count() > 1 }} onClick={() => setCount(count() + 1)}>
        {count() ? "some" : "none"} {count().length}
      </button>
    </Theme>
  );
}
`;

const CLEAN = `export const Greeting = (props: { name: string }) => <p>hello {props.name}</p>;\n`;

const plain: Paint = {
  error: (text) => text,
  warning: (text) => text,
  note: (text) => text,
  dim: (text) => text,
  bold: (text) => text,
};

describe("check", () => {
  test("reports each finding with its code, position, page and guide section", () => {
    const root = project({ "src/view.tsx": VIEW, "src/greeting.tsx": CLEAN });
    const result = check({ root });
    expect(result.files).toBe(2);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "BARQ022",
      "BARQ023",
      "BARQ001",
      "BARQ024",
      "BARQ002",
      "BARQ003",
    ]);
    expect(result.summary).toEqual({ errors: 3, warnings: 3, notes: 0, fixable: 6, fixed: 0 });
    const [first] = result.findings;
    expect(first).toMatchObject({
      severity: "error",
      file: "src/view.tsx",
      line: 6,
      column: 6,
      docs: "https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ022.md",
      skill: "node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md#barq022",
    });
    expect(first?.fix).toHaveLength(2);
  });

  test("a clean project has no findings", () => {
    const root = project({ "src/greeting.tsx": CLEAN });
    expect(check({ root }).summary).toEqual({
      errors: 0,
      warnings: 0,
      notes: 0,
      fixable: 0,
      fixed: 0,
    });
  });

  test("`fix` writes the repairs and reports what is left", () => {
    const root = project({ "src/view.tsx": VIEW });
    const result = check({ root, fix: true });
    expect(readFileSync(join(root, "src/view.tsx"), "utf8")).toBe(REPAIRED);
    expect(result.summary).toEqual({ errors: 0, warnings: 0, notes: 0, fixable: 0, fixed: 6 });
  });

  test("without `fix` no file is written", () => {
    const root = project({ "src/view.tsx": VIEW });
    check({ root });
    expect(readFileSync(join(root, "src/view.tsx"), "utf8")).toBe(VIEW);
  });

  test("a level set for a code replaces its default, and `suppress` removes it", () => {
    const root = project({ "src/view.tsx": VIEW });
    const raised = check({ root, levels: [["BARQ001", "error"]] });
    expect(raised.findings.find((finding) => finding.code === "BARQ001")?.severity).toBe("error");
    const quiet = check({ root, levels: [["BARQ001", "suppress"]] });
    expect(quiet.findings.some((finding) => finding.code === "BARQ001")).toBe(false);
  });

  test("only the paths named are checked, and dependencies never are", () => {
    const root = project({
      "src/view.tsx": VIEW,
      "other/view.tsx": VIEW,
      "node_modules/pkg/view.tsx": VIEW,
      "dist/view.tsx": VIEW,
    });
    expect(check({ root, paths: ["src"] }).files).toBe(1);
    expect(check({ root }).files).toBe(2);
  });

  test("a script with no JSX is checked only when it names barq", () => {
    const root = project({
      "src/store.ts": `import { createSignal } from "@barqjs/core";\nexport const [n] = createSignal(0);\n`,
      "src/math.ts": "export const add = (a: number, b: number) => a + b;\n",
      "src/types.d.ts": "export type Id = string;\n",
    });
    expect(check({ root }).files).toBe(1);
  });

  test("a file that does not parse is one finding at error level", () => {
    const root = project({ "src/broken.tsx": "export const V = () => <p>;\n" });
    const result = check({ root });
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.findings[0]?.file).toBe("src/broken.tsx");
  });
});

describe("file routes", () => {
  const route = (id: string, body: string): string =>
    `import { Link, createFileRoute } from "@barqjs/router";\nexport const Route = createFileRoute("${id}")({ component: () => ${body} });\n`;

  test("a link to a path no route file gives is reported, and one to a route is not", () => {
    const root = project({
      "src/routes/index.tsx": route("/", '<Link to="/about">about</Link>'),
      "src/routes/about.tsx": route("/about", '<Link to="/pricing">pricing</Link>'),
    });
    const result = check({ root });
    expect(result.findings.map((finding) => [finding.code, finding.file])).toEqual([
      ["BARQ013", "src/routes/about.tsx"],
    ]);
    expect(result.findings[0]?.message).toContain('`to="/pricing"` matches none');
  });

  test("a route file whose id differs from its filename is an error, and nothing is rewritten", () => {
    const stale = route("/old", "<p>salama</p>");
    const root = project({ "src/routes/about.tsx": stale });
    const result = check({ root });
    expect(result.summary.errors).toBe(1);
    expect(result.findings[0]).toMatchObject({ severity: "error", file: "src/routes/about.tsx" });
    expect(result.findings[0]?.message).toContain('Write `createFileRoute("/about")`.');
    expect(readFileSync(join(root, "src/routes/about.tsx"), "utf8")).toBe(stale);
  });

  test("with no routes directory a link is not judged", () => {
    const root = project({
      "src/view.tsx": `import { Link } from "@barqjs/router";\nexport const V = () => <Link to="/anywhere">go</Link>;\n`,
    });
    expect(check({ root }).findings).toEqual([]);
  });

  test("`routes` names another directory", () => {
    const root = project({
      "app/pages/index.tsx": route("/", '<Link to="/nowhere">x</Link>'),
    });
    expect(check({ root, routes: "app/pages" }).findings.map((finding) => finding.code)).toEqual([
      "BARQ013",
    ]);
  });
});

describe("a project's own settings", () => {
  const link = `import { Link } from "@barqjs/router";\nexport const V = () => <Link to="/demo/users">users</Link>;\n`;
  const index = `import { createFileRoute } from "@barqjs/router";\nexport const Route = createFileRoute("/")({ component: () => <p>salama</p> });\n`;

  test("`barq.check` in package.json declares routes beside the file routes, and levels", () => {
    const root = project({
      "src/routes/index.tsx": index,
      "src/view.tsx": link,
      "package.json": JSON.stringify({
        barq: { check: { paths: ["src"], extraRoutes: ["/demo/users"] } },
      }),
    });
    expect(main(["check", "--json", "--root", root], () => {})).toBe(0);
    expect(check({ root, ...projectOptions(root) }).findings).toEqual([]);
    expect(check({ root }).findings.map((finding) => finding.code)).toEqual(["BARQ013"]);
  });

  test("a level in package.json applies, and one on the command line replaces it", () => {
    const root = project({
      "src/routes/index.tsx": index,
      "src/view.tsx": link,
      "package.json": JSON.stringify({ barq: { check: { levels: { BARQ013: "error" } } } }),
    });
    expect(main(["check", "--root", root], () => {})).toBe(1);
    expect(main(["check", "--root", root, "--level", "BARQ013=suppress"], () => {})).toBe(0);
  });

  test("a package.json with no such field, or none at all, sets nothing", () => {
    expect(projectOptions(project({ "package.json": "{}" }))).toEqual({});
    expect(projectOptions(project({}))).toEqual({});
  });
});

describe("applyFixes", () => {
  test("two findings with the same edit apply it once", () => {
    const fix = [{ pos: 5, end: 5, text: "()" }];
    const finding = {
      severity: "warning" as const,
      message: "",
      file: "a.tsx",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
      fix,
    };
    expect(applyFixes("count + count", [finding, finding])).toEqual(["count() + count", 1]);
  });

  test("an edit that overlaps one already taken waits for the next pass", () => {
    const base = {
      severity: "warning" as const,
      message: "",
      file: "a.tsx",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    };
    const [text, repaired] = applyFixes("abcdef", [
      { ...base, fix: [{ pos: 0, end: 4, text: "X" }] },
      { ...base, fix: [{ pos: 2, end: 6, text: "Y" }] },
    ]);
    expect(text).toBe("Xef");
    expect(repaired).toBe(1);
  });
});

describe("the text form", () => {
  test("one block per finding, then the count and the guide", () => {
    const root = project({ "src/view.tsx": VIEW });
    const text = formatText(check({ root }), plain);
    expect(text).toContain("src/view.tsx:6:6 error BARQ022 `Theme` is a context");
    expect(text).toContain("  fix: `barq check --fix` repairs this");
    expect(text).toEndWith(
      "3 errors, 3 warnings, 0 notes in 1 file, 6 more fixable with `--fix`\n" +
        "repair guide: node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md",
    );
  });

  test("a clean result is one line", () => {
    const root = project({ "src/greeting.tsx": CLEAN });
    expect(formatText(check({ root }), plain)).toBe("0 errors, 0 warnings, 0 notes in 1 file");
  });
});

describe("codes", () => {
  test("lists every code with its level and guide section", () => {
    const list = codes();
    const first = list.find((entry) => entry.code === "BARQ001");
    expect(first?.level).toBe("warning");
    expect(first?.skill).toEndWith("SKILL.md#barq001");
    expect(list.some((entry) => entry.code === "BARQ005")).toBe(false);
  });
});

describe("the command line", () => {
  function run(argv: string[]): { status: number; out: string } {
    let out = "";
    const status = main(argv, (text) => {
      out += text;
    });
    return { status, out };
  }

  test("`check --json` prints one document and exits 1 on an error", () => {
    const root = project({ "src/view.tsx": VIEW });
    const { status, out } = run(["check", "--json", "--root", root]);
    expect(status).toBe(1);
    const result = JSON.parse(out) as CheckResult;
    expect(result.version).toBe(1);
    expect(result.summary.errors).toBe(3);
  });

  test("warnings alone exit 0 until `--max-warnings` is passed", () => {
    const root = project({
      "src/view.tsx": `import { createSignal } from "@barqjs/core";\nexport function V() {\n  const [n] = createSignal(0);\n  return <p>{n + 1}</p>;\n}\n`,
    });
    expect(run(["check", "--root", root]).status).toBe(0);
    expect(run(["check", "--root", root, "--max-warnings", "0"]).status).toBe(1);
    expect(run(["check", "--root", root, "--level", "barq001=error"]).status).toBe(1);
  });

  test("`check --fix` exits 0 once everything is repaired", () => {
    const root = project({ "src/view.tsx": VIEW });
    const { status, out } = run(["check", "--fix", "--root", root]);
    expect(status).toBe(0);
    expect(out).toContain("6 fixed");
  });

  test("a command line it does not understand exits 2 and says what to write", () => {
    expect(run(["check", "--nope"])).toEqual({
      status: 2,
      out: "`--nope` is not an option of barq. Run `barq --help`.\n",
    });
    expect(run(["check", "--level", "BARQ001"]).status).toBe(2);
    expect(run(["check", "--max-warnings", "many"]).status).toBe(2);
    expect(run(["check", "--root"]).status).toBe(2);
    expect(run(["build"]).status).toBe(2);
    expect(run([]).status).toBe(2);
    expect(run(["--help"]).status).toBe(0);
  });

  test("the arguments parse into a command, paths and options", () => {
    expect(parse(["check", "src", "app", "--json", "--level", "BARQ004=error"])).toMatchObject({
      command: "check",
      paths: ["src", "app"],
      json: true,
      fix: false,
      levels: [["BARQ004", "error"]],
    });
  });

  test("run as a program, it writes to stdout and sets the exit status", async () => {
    const root = project({ "src/view.tsx": VIEW });
    const child = Bun.spawn(["bun", cli, "check", "--json", "--root", root], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(err).toBe("");
    expect(status).toBe(1);
    expect((JSON.parse(out) as CheckResult).findings).toHaveLength(6);
  });
});
