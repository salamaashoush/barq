import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ADD_ONS } from "../src/addons.ts";
import { parse } from "../src/args.ts";
import { addImport, execute } from "../src/project.ts";
import { TEMPLATE_ROOT, TEMPLATES_ENV, load, manifestOf } from "../src/source.ts";
import { TEMPLATES } from "../src/templates.ts";

const CLI = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const made: string[] = [];
const scratch = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "create-barq-cli-"));
  made.push(directory);
  return directory;
};
afterAll(() => {
  for (const directory of made) rmSync(directory, { recursive: true, force: true });
});

function cli(cwd: string, args: readonly string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync({
    cmd: ["bun", CLI, ...args],
    cwd,
    env: { ...process.env, ...env },
    stdin: "ignore",
  });
  return {
    code: result.exitCode,
    out: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

describe("the command line", () => {
  test("every question has a flag", () => {
    expect(
      parse([
        "app",
        "-t",
        "spa",
        "--add-ons=ui",
        "--pm",
        "pnpm",
        "--no-install",
        "--no-git",
        "--yes",
        "--ref",
        "main",
      ]),
    ).toMatchObject({
      directory: "app",
      template: "spa",
      addOns: ["ui"],
      packageManager: "pnpm",
      install: false,
      git: false,
      yes: true,
      ref: "main",
    });
    expect(parse(["--no-add-ons"]).addOns).toEqual([]);
    expect(parse([]).addOns).toBeUndefined();
  });

  test("an unknown flag and a flag with no value are refused", () => {
    expect(() => parse(["--tempalte", "spa"])).toThrow("unknown option --tempalte");
    expect(() => parse(["--template"])).toThrow("--template needs a value");
  });
});

describe("where templates come from", () => {
  test("the manifest lists every file the templates have", () => {
    const written = JSON.parse(
      readFileSync(join(TEMPLATE_ROOT, "manifest.json"), "utf8"),
    ) as unknown;
    // `bun run manifest` writes it. Stale, the CLI fetches a template short of a file.
    expect(written).toEqual(
      manifestOf(
        TEMPLATE_ROOT,
        TEMPLATES.map((template) => template.name),
      ),
    );
  });

  test("offline takes the copy this package ships", async () => {
    const loaded = await load("minimal", { offline: true });
    expect(loaded.origin).toBe("bundled");
    expect([...loaded.files.keys()]).toContain("package.json");
  });

  test("a source that cannot be reached falls back to the shipped copy, and says why", async () => {
    const before = process.env[TEMPLATES_ENV];
    process.env[TEMPLATES_ENV] = "http://127.0.0.1:9/nothing-listens-here";
    try {
      const loaded = await load("minimal");
      expect(loaded.origin).toBe("bundled");
      expect(loaded.fellBack).toBeDefined();
      // A ref somebody named is a request for that ref, not for whatever is at hand.
      expect(load("minimal", { ref: "v1" })).rejects.toThrow();
    } finally {
      if (before === undefined) delete process.env[TEMPLATES_ENV];
      else process.env[TEMPLATES_ENV] = before;
    }
  });

  test("a served source is fetched file by file from its manifest", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/manifest.json") {
          return Response.json({ version: 1, templates: { tiny: ["package.json", "src/a.ts"] } });
        }
        if (path === "/tiny/package.json") return new Response('{"name":"x"}');
        if (path === "/tiny/src/a.ts") return new Response("export const a = 1;\n");
        return new Response("no", { status: 404 });
      },
    });
    const before = process.env[TEMPLATES_ENV];
    process.env[TEMPLATES_ENV] = `http://127.0.0.1:${String(server.port)}`;
    try {
      const loaded = await load("tiny");
      expect(loaded.origin).toBe("github");
      expect(new TextDecoder().decode(loaded.files.get("src/a.ts"))).toBe("export const a = 1;\n");
    } finally {
      if (before === undefined) delete process.env[TEMPLATES_ENV];
      else process.env[TEMPLATES_ENV] = before;
      await server.stop(true);
    }
  });
});

describe("a project made without a prompt", () => {
  test("--yes writes the default template and says what is left to run", () => {
    const cwd = scratch();
    const result = cli(cwd, ["app", "--yes", "--offline", "--no-install", "--no-git"]);
    expect(result.code, result.out).toBe(0);
    const manifest = JSON.parse(readFileSync(join(cwd, "app", "package.json"), "utf8")) as {
      name: string;
    };
    expect(manifest.name).toBe("app");
    expect(existsSync(join(cwd, "app", "src", "routes", "__root.tsx"))).toBe(true);
    expect(existsSync(join(cwd, "app", ".gitignore"))).toBe(true);
    expect(existsSync(join(cwd, "app", ".git"))).toBe(false);
    expect(result.out).toContain("install");
  });

  test("a directory that is not empty is refused without --overwrite", () => {
    const cwd = scratch();
    cli(cwd, ["app", "--yes", "--offline", "--no-install", "--no-git", "-t", "minimal"]);
    const again = cli(cwd, ["app", "--yes", "--offline", "--no-install", "--no-git"]);
    expect(again.code).toBe(1);
    expect(again.out).toContain("not empty");
  });

  test("--git starts a repository with the files in it", () => {
    const cwd = scratch();
    const result = cli(cwd, ["app", "--yes", "--offline", "--no-install", "-t", "minimal"]);
    expect(result.code, result.out).toBe(0);
    expect(existsSync(join(cwd, "app", ".git"))).toBe(true);
  });

  test("the lists answer a tool as JSON", () => {
    const templates = JSON.parse(cli(scratch(), ["--list-templates", "--json"]).out) as {
      name: string;
    }[];
    expect(templates.map((row) => row.name)).toEqual(TEMPLATES.map((template) => template.name));
    const addOns = JSON.parse(cli(scratch(), ["--list-add-ons", "--json"]).out) as {
      name: string;
    }[];
    expect(addOns.map((row) => row.name)).toEqual(ADD_ONS.map((addOn) => addOn.name));
  });
});

describe("what an add-on does to a project", () => {
  test("an import is added after the last import, once", () => {
    const cwd = scratch();
    writeFileSync(
      join(cwd, "main.tsx"),
      'import { render } from "@barqjs/web";\nimport {\n  a,\n  b,\n} from "./x.ts";\n\nrender();\n',
    );
    expect(addImport(cwd, "main.tsx", 'import "./theme.ts";')).toBe(true);
    addImport(cwd, "main.tsx", 'import "./theme.ts";');
    expect(readFileSync(join(cwd, "main.tsx"), "utf8")).toBe(
      'import { render } from "@barqjs/web";\nimport {\n  a,\n  b,\n} from "./x.ts";\nimport "./theme.ts";\n\nrender();\n',
    );
  });

  test("each package manager runs a package its own way", () => {
    expect(execute("npm")).toEqual(["npx", "--yes"]);
    expect(execute("pnpm")).toEqual(["pnpm", "dlx"]);
    expect(execute("bun")).toEqual(["bunx"]);
  });
});
