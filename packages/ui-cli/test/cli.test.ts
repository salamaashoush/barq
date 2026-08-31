/**
 * The commands, driven as a person drives them.
 *
 * A subprocess rather than a function call, because half of what these do is
 * the file system and the other half is what they print — and a test that
 * imported the module would be testing neither the argument parsing nor the
 * exit code.
 *
 * The project is a temporary directory with a symlink to this repository's
 * `@barqjs/ui`, which is what `registry: "node_modules"` resolves. It needs
 * that package BUILT, so the suite skips itself rather than failing when it is
 * not.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../src/index.ts");
const ui = join(here, "../../ui");
const ready =
  existsSync(join(ui, "registry/index.json")) && existsSync(join(ui, "dist/theme/index.js"));

const workspaces: string[] = [];

afterAll(() => {
  for (const workspace of workspaces) rmSync(workspace, { recursive: true, force: true });
});

function project(): string {
  const workspace = mkdtempSync(join(tmpdir(), "barq-ui-cli-"));
  workspaces.push(workspace);
  mkdirSync(join(workspace, "node_modules/@barqjs"), { recursive: true });
  symlinkSync(ui, join(workspace, "node_modules/@barqjs/ui"), "dir");
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({ name: "probe", private: true, type: "module" }),
  );
  return workspace;
}

interface Result {
  readonly code: number;
  readonly out: string;
}

async function barq(cwd: string, ...args: string[]): Promise<Result> {
  const child = Bun.spawn(["bun", "run", cli, ...args, "--cwd", cwd], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code: await child.exited, out: out + err };
}

function file(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe.if(ready)("barq-ui", () => {
  let root = "";

  beforeEach(() => {
    root = project();
  });

  test("help says what the commands are, and needs no project", async () => {
    const result = await barq(root, "--help");
    expect(result.code).toBe(0);
    for (const command of ["init", "add", "diff", "sync", "list", "theme", "build"]) {
      expect(result.out).toContain(command);
    }
  });

  test("add before init says what to do about it", async () => {
    const result = await barq(root, "add", "button");
    expect(result.code).toBe(1);
    expect(result.out).toContain("barq-ui init");
  });

  test("init writes the config, the theme and the base styles", async () => {
    const result = await barq(root, "init", "--yes");
    expect(result.code).toBe(0);

    const config = JSON.parse(file(root, "components.json")) as Record<string, unknown>;
    expect(config["registry"]).toBe("node_modules");
    expect((config["theme"] as Record<string, unknown>)["base"]).toBe("neutral");

    expect(existsSync(join(root, "src/components/theme/theme.ts"))).toBe(true);
    expect(existsSync(join(root, "src/components/theme/base.ts"))).toBe(true);
    expect(existsSync(join(root, "src/components/theme/reset.ts"))).toBe(true);
    expect(file(root, "src/components/theme/theme.ts")).toContain("--primary: oklch(0.205 0 0)");
  });

  test("--no-reset leaves the reset out, and says so in the config", async () => {
    await barq(root, "init", "--yes", "--no-reset");
    expect(existsSync(join(root, "src/components/theme/reset.ts"))).toBe(false);
    expect(file(root, "src/components/theme/theme.ts")).not.toContain("reset");
    expect(JSON.parse(file(root, "components.json"))["reset"]).toBe(false);
  });

  test("a theme chosen at init is the one written", async () => {
    await barq(root, "init", "--yes", "--theme", "zinc", "--radius", "0");
    const theme = file(root, "src/components/theme/theme.ts");
    expect(theme).toContain("Zinc");
    expect(theme).toContain("--radius: 0;");
  });

  test("add brings the component and everything it needs", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "dialog");
    expect(result.code).toBe(0);

    for (const path of [
      "src/components/ui/dialog.tsx",
      "src/components/ui/button.tsx",
      "src/components/lib/overlay.tsx",
      "src/components/lib/slot.ts",
    ]) {
      expect(existsSync(join(root, path)), `${path} was not written`).toBe(true);
    }
    expect(result.out).toContain("@barqjs/aria");
  });

  test("the copied file's relative imports point at where the files landed", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "dialog");
    const source = file(root, "src/components/ui/dialog.tsx");
    expect(source).toContain('from "../lib/slot.ts"');
    expect(source).toContain('from "./button.tsx"');
    expect(source).toContain('from "@barqjs/aria/dialog"');
  });

  test("adding twice changes nothing the second time", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");
    const before = file(root, "src/components/ui/badge.tsx");

    const again = await barq(root, "add", "badge");
    expect(again.out).toContain("up to date");
    expect(file(root, "src/components/ui/badge.tsx")).toBe(before);
  });

  test("diff reports an edit, and sync leaves it alone", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");

    const path = join(root, "src/components/ui/badge.tsx");
    writeFileSync(path, `${readFileSync(path, "utf8")}\n// mine\n`);

    const changed = await barq(root, "diff");
    expect(changed.out).toContain("badge.tsx");
    expect(changed.out).toContain("- // mine");

    const synced = await barq(root, "sync");
    expect(synced.out).toContain("Nothing was replaced");
    expect(readFileSync(path, "utf8")).toContain("// mine");
  });

  test("sync --overwrite takes the registry's version", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");

    const path = join(root, "src/components/ui/badge.tsx");
    writeFileSync(path, `${readFileSync(path, "utf8")}\n// mine\n`);

    const synced = await barq(root, "sync", "--overwrite");
    expect(synced.out).toContain("Synced 1 file");
    expect(readFileSync(path, "utf8")).not.toContain("// mine");
    expect((await barq(root, "diff")).out).toContain("Nothing has changed");
  });

  test("add --overwrite replaces an edited file, and plain add does not", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");

    const path = join(root, "src/components/ui/badge.tsx");
    writeFileSync(path, "// only this\n");

    const kept = await barq(root, "add", "badge");
    expect(kept.out).toContain("left alone");
    expect(readFileSync(path, "utf8")).toBe("// only this\n");

    await barq(root, "add", "badge", "--overwrite");
    expect(readFileSync(path, "utf8")).toContain("badgeVariants");
  });

  test("theme rewrites the theme file and records the choice", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "theme", "blue");
    expect(result.code).toBe(0);

    const config = JSON.parse(file(root, "components.json")) as Record<string, unknown>;
    expect((config["theme"] as Record<string, unknown>)["accent"]).toBe("blue");
    expect(file(root, "src/components/theme/theme.ts")).toContain("Neutral with Blue");
  });

  test("an unknown theme lists the ones that exist", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "theme", "chartreuse");
    expect(result.code).toBe(1);
    expect(result.out).toContain("neutral");
  });

  test("list marks what has been added", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");
    const result = await barq(root, "list");
    expect(result.out).toContain("badge");
    expect(result.out).toMatch(/badge.*\(added\)/);
    expect(result.out).toContain("card");
  });

  test("build turns the project's own components into a registry", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");
    const result = await barq(root, "build", "src/components");
    expect(result.code).toBe(0);

    const index = JSON.parse(file(root, "registry/index.json")) as {
      items: { name: string; registryDependencies: string[] }[];
    };
    expect(index.items.map((item) => item.name)).toContain("badge");
    expect(index.items.find((item) => item.name === "badge")?.registryDependencies).toContain(
      "slot",
    );
  });

  test("an unknown component names itself", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "nonesuch");
    expect(result.code).toBe(1);
    expect(result.out).toContain("nonesuch");
  });

  test("an unknown command is an error rather than a silent no-op", async () => {
    const result = await barq(root, "frobnicate");
    expect(result.code).toBe(1);
    expect(result.out).toContain("frobnicate");
  });
});
