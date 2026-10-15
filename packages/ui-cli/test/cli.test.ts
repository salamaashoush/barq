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
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
  existsSync(join(ui, "registry/index.json")) && existsSync(join(ui, "src/theme/index.ts"));

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

async function spawn(
  cwd: string,
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<Result> {
  const child = Bun.spawn(["bun", "run", cli, ...args, "--cwd", cwd], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code: await child.exited, out: out + err };
}

/**
 * `--no-install` on every command: the project is a temporary directory with
 * no lockfile and no network, and what a command WRITES is what these assert.
 * The install itself has its own tests, against a package manager that only
 * records what it was asked for.
 */
async function barq(cwd: string, ...args: string[]): Promise<Result> {
  return await spawn(cwd, [...args, "--no-install"]);
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
    for (const command of [
      "init",
      "add",
      "diff",
      "sync",
      "list",
      "search",
      "view",
      "info",
      "theme",
      "build",
    ]) {
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

  test("a name init cannot resolve writes nothing at all", async () => {
    // `init` writes the base styles first and reaches the theme last, so this
    // used to leave four files on disk and no `components.json` beside them:
    // a project too far in to `add` to, and too far in for `init` to be the
    // first thing you run.
    for (const bad of [
      ["--theme", "nutral"],
      ["--accent", "bleu"],
      ["--radius", "potato"],
    ]) {
      const result = await barq(root, "init", "--yes", ...bad);
      expect(result.code, `${bad.join(" ")} was accepted`).toBe(1);
      expect(existsSync(join(root, "components.json"))).toBe(false);
      expect(existsSync(join(root, "src/components/theme/base.ts"))).toBe(false);
      expect(existsSync(join(root, "src/components/lib/utils.ts"))).toBe(false);
    }
  });

  test("a rejected name says which ones exist, by kind", async () => {
    const base = await barq(root, "init", "--yes", "--theme", "nutral");
    expect(base.out).toContain("neutral");
    expect(base.out).toContain("taupe");
    // A base is not an accent: naming an accent as the base has to say so
    // rather than listing all twenty-four and leaving the reader to guess.
    expect(base.out).not.toContain("fuchsia");

    const accent = await barq(root, "init", "--yes", "--accent", "bleu");
    expect(accent.out).toContain("blue");
    expect(accent.out).not.toContain("taupe");
  });

  test("an accent is a base's superior, not a base", async () => {
    const result = await barq(root, "init", "--yes", "--theme", "blue");
    expect(result.code).toBe(1);
    expect(result.out).toContain("no base theme");
  });

  test("a chosen radius replaces the base's own rather than following it", async () => {
    await barq(root, "init", "--yes", "--radius", "0.45rem");
    const theme = file(root, "src/components/theme/theme.ts");
    // Every base declares `radius` among its tokens. Appending wrote it twice:
    // the cascade took the second and the page was right, but the file is the
    // project's to read and said two different things.
    expect(theme.match(/--radius:/g)).toHaveLength(1);
    expect(theme).toContain("--radius: 0.45rem;");
  });

  test("--dark writes the selector the project asked for", async () => {
    await barq(root, "init", "--yes", "--dark", "media");
    const theme = file(root, "src/components/theme/theme.ts");
    expect(theme).toContain("@media (prefers-color-scheme: dark)");
    expect(JSON.parse(file(root, "components.json"))["theme"]["dark"]).toBe("media");
  });

  test("an unknown theme lists the ones that exist", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "theme", "chartreuse");
    expect(result.code).toBe(1);
    expect(result.out).toContain("neutral");
  });

  test("a style is copied in, and only the one that was chosen", async () => {
    // A style is 180 KB and somebody picks ONE. Copying it is the same trade
    // the whole tool makes: what it writes is yours, and yours to edit.
    const result = await barq(root, "init", "--yes", "--style", "lyra");
    expect(result.code).toBe(0);
    const written = file(root, "src/components/theme/style.css");
    expect(written).toContain(".style-lyra");
    expect(written.length).toBeGreaterThan(50_000);
    expect(JSON.parse(file(root, "components.json"))["theme"]["style"]).toBe("lyra");
    // The class is what applies it, so the output has to say so.
    expect(result.out).toContain('class="style-lyra"');
  });

  test("a style targets data-slot, which is what the components already carry", async () => {
    await barq(root, "init", "--yes", "--style", "nova");
    const written = file(root, "src/components/theme/style.css");
    // Upstream writes `.cn-button`; this package has put a `data-slot` on every
    // element since before styles existed, so a style needs no component change.
    expect(written).toContain('[data-slot="button"]');
    expect(written).not.toContain(".cn-button");
    // LAST layer, so a style beats the component's own rules without either
    // side counting specificity.
    expect(written).toContain("@layer barq.style");
  });

  test("style swaps it and records the choice", async () => {
    await barq(root, "init", "--yes", "--style", "vega");
    const result = await barq(root, "style", "sera");
    expect(result.code).toBe(0);
    expect(file(root, "src/components/theme/style.css")).toContain(".style-sera");
    expect(JSON.parse(file(root, "components.json"))["theme"]["style"]).toBe("sera");
  });

  test("a style name nothing offers writes nothing and lists the eight", async () => {
    const result = await barq(root, "init", "--yes", "--style", "nope");
    expect(result.code).toBe(1);
    expect(existsSync(join(root, "components.json"))).toBe(false);
    expect(existsSync(join(root, "src/components/theme/style.css"))).toBe(false);
    for (const name of ["vega", "nova", "lyra", "sera"]) expect(result.out).toContain(name);
  });

  test("no style asked for, no style written", async () => {
    await barq(root, "init", "--yes");
    expect(existsSync(join(root, "src/components/theme/style.css"))).toBe(false);
    expect(JSON.parse(file(root, "components.json"))["theme"]["style"]).toBeUndefined();
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

  test("build sees an import that is wrapped over several lines", async () => {
    // The regex behind this could not see past the end of a line, so a
    // component whose import list was long enough to wrap declared none of it:
    // in `@barqjs/ui` itself that cost fourteen items their dependencies, and
    // `add context-menu` wrote a file importing a component the project did
    // not have.
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");
    mkdirSync(join(root, "src/components/ui"), { recursive: true });
    writeFileSync(
      join(root, "src/components/ui/panel.tsx"),
      [
        "import {",
        "  Badge,",
        "  type BadgeProps,",
        '} from "./badge.tsx";',
        "import {",
        "  css,",
        "  clsx,",
        '} from "@barqjs/css";',
        "",
        "export function Panel() {",
        "  return [Badge, css, clsx] as unknown as BadgeProps;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await barq(root, "build", "src/components");
    expect(result.code).toBe(0);

    const item = JSON.parse(file(root, "registry/panel.json")) as {
      dependencies: string[];
      registryDependencies: string[];
    };
    expect(item.dependencies).toContain("@barqjs/css");
    expect(item.registryDependencies).toContain("badge");
  });

  test("build makes one item of a block's directory, and types a file by where it is", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");
    const components = join(root, "src/components");
    mkdirSync(join(components, "blocks/pricing/components"), { recursive: true });
    mkdirSync(join(components, "hooks"), { recursive: true });
    writeFileSync(
      join(components, "blocks/pricing/page.tsx"),
      'import { Tier } from "./components/tier.tsx";\nexport const Pricing = Tier;\n',
    );
    writeFileSync(
      join(components, "blocks/pricing/components/tier.tsx"),
      'import { Badge } from "../../../ui/badge.tsx";\nimport { useTier } from "../../../hooks/use-tier.ts";\nexport const Tier = [Badge, useTier];\n',
    );
    writeFileSync(join(components, "hooks/use-tier.ts"), "export const useTier = 1;\n");

    const result = await barq(root, "build", "src/components");
    expect(result.code).toBe(0);

    const pricing = JSON.parse(file(root, "registry/pricing.json")) as {
      type: string;
      registryDependencies: string[];
      files: { path: string; type: string }[];
    };
    expect(pricing.type).toBe("registry:block");
    expect(pricing.files.map((each) => each.path)).toEqual([
      "blocks/pricing/components/tier.tsx",
      "blocks/pricing/page.tsx",
    ]);
    // Its own two files import each other, and that is not a dependency.
    expect(pricing.registryDependencies).toEqual(["badge", "use-tier"]);

    const hook = JSON.parse(file(root, "registry/use-tier.json")) as { type: string };
    expect(hook.type).toBe("registry:hook");
  });

  test("what build wrote can be added from where it was written", async () => {
    await barq(root, "init", "--yes");
    mkdirSync(join(root, "kit/hooks"), { recursive: true });
    writeFileSync(join(root, "kit/hooks/use-tier.ts"), "export const useTier = 1;\n");
    await barq(root, "build", "kit");

    const path = join(root, "components.json");
    const config = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeFileSync(
      path,
      JSON.stringify({ ...config, registries: { "@kit": "./registry/{name}.json" } }),
    );

    const result = await barq(root, "add", "@kit/use-tier");
    expect(result.code).toBe(0);
    expect(file(root, "src/hooks/use-tier.ts")).toBe("export const useTier = 1;\n");
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

  test("add brings a block, with the components it is built from", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "login-01");
    expect(result.code).toBe(0);

    for (const path of [
      "src/components/blocks/login-01.tsx",
      "src/components/ui/card.tsx",
      "src/components/ui/field.tsx",
      "src/components/ui/input.tsx",
      "src/components/ui/button.tsx",
    ]) {
      expect(existsSync(join(root, path)), `${path} was not written`).toBe(true);
    }

    const block = file(root, "src/components/blocks/login-01.tsx");
    // The site writes a block against the package's barrel. A project that owns
    // its components has no barrel, so each name comes from the file it is in.
    expect(block).not.toContain('"@barqjs/ui"');
    expect(block).toContain('from "../ui/card.tsx"');
    expect(block).toContain('from "../ui/field.tsx"');
    // And the preview the site measures against is the viewport here.
    expect(block).not.toContain("@container preview");
    expect(block).toContain("@media (width >= 48rem)");

    const config = JSON.parse(file(root, "components.json")) as {
      items: Record<string, Record<string, string>>;
    };
    expect(Object.keys(config.items["login-01"] ?? {})).toEqual(["blocks/login-01.tsx"]);
  });

  test("a block's imports follow the components to wherever they were put", async () => {
    await barq(root, "init", "--yes", "--path", "app/widgets/ui");
    await barq(root, "add", "sidebar-07");
    const block = file(root, "app/widgets/blocks/sidebar-07.tsx");
    expect(block).toContain('from "../ui/sidebar.tsx"');
    expect(block).toContain('from "../lib/layout.ts"');
    expect(existsSync(join(root, "app/widgets/lib/layout.ts"))).toBe(true);
    expect(existsSync(join(root, "app/widgets/ui/sidebar.tsx"))).toBe(true);
  });

  test("add brings a family of charts, and what they share", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "chart-area");
    expect(result.code).toBe(0);

    for (const path of [
      "src/components/charts/area.tsx",
      "src/components/charts/shared.tsx",
      "src/components/ui/chart.tsx",
      "src/components/ui/card.tsx",
    ]) {
      expect(existsSync(join(root, path)), `${path} was not written`).toBe(true);
    }
    const area = file(root, "src/components/charts/area.tsx");
    expect(area).toContain('from "./shared.tsx"');
    expect(area).toContain('from "../ui/chart.tsx"');
    expect(result.out).toContain("@tanstack/charts");
  });

  test("every block and every chart the registry lists can be added", async () => {
    await barq(root, "init", "--yes");
    const listed = JSON.parse(file(ui, "registry/index.json")) as {
      items: { name: string; type: string; files: string[] }[];
    };
    const blocks = listed.items.filter((item) => item.type === "registry:block");
    expect(blocks.length).toBeGreaterThanOrEqual(27);

    const result = await barq(root, "add", ...blocks.map((item) => item.name));
    expect(result.code).toBe(0);
    for (const item of blocks) {
      for (const path of item.files) {
        expect(existsSync(join(root, "src/components", path)), `${path} was not written`).toBe(
          true,
        );
      }
    }
  });

  test("--dry-run says what would be written and writes none of it", async () => {
    await barq(root, "init", "--yes");
    const before = file(root, "components.json");

    const result = await barq(root, "add", "dialog", "--dry-run");
    expect(result.code).toBe(0);
    expect(result.out).toContain("Nothing was written");
    expect(result.out).toContain("+ src/components/ui/dialog.tsx");
    expect(result.out).toContain("+ src/components/ui/button.tsx");
    expect(result.out).toContain("@barqjs/aria");

    expect(existsSync(join(root, "src/components/ui/dialog.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/components/ui/button.tsx"))).toBe(false);
    expect(file(root, "components.json")).toBe(before);
  });

  test("--diff shows what add would change in a file, and changes nothing", async () => {
    await barq(root, "init", "--yes");
    await barq(root, "add", "badge");
    const path = join(root, "src/components/ui/badge.tsx");
    const edited = `${readFileSync(path, "utf8")}\n// mine\n`;
    writeFileSync(path, edited);

    const result = await barq(root, "add", "badge", "--diff");
    expect(result.code).toBe(0);
    expect(result.out).toContain("src/components/ui/badge.tsx");
    expect(result.out).toContain("- // mine");
    expect(readFileSync(path, "utf8")).toBe(edited);

    const same = await barq(root, "add", "kbd", "--diff=nonesuch.tsx");
    expect(same.out).toContain("Nothing would change");
  });

  test("--diff marks a file the project does not have yet as new", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "kbd", "--diff=kbd.tsx");
    expect(result.out).toContain("src/components/ui/kbd.tsx (new)");
    expect(result.out).toContain("+ ");
    expect(existsSync(join(root, "src/components/ui/kbd.tsx"))).toBe(false);
  });

  test("--view prints the file as it would be written, and only the one asked for", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "dialog", "--view=dialog.tsx");
    expect(result.code).toBe(0);
    expect(result.out).toContain("src/components/ui/dialog.tsx");
    expect(result.out).toContain('from "./button.tsx"');
    expect(result.out).not.toContain("src/components/ui/button.tsx");
    expect(existsSync(join(root, "src/components/ui/dialog.tsx"))).toBe(false);
  });

  test("--all adds every ui component, and no block", async () => {
    await barq(root, "init", "--yes");
    const result = await barq(root, "add", "--all");
    expect(result.code).toBe(0);

    const listed = JSON.parse(file(ui, "registry/index.json")) as {
      items: { name: string; type: string; files: string[] }[];
    };
    for (const item of listed.items.filter((each) => each.type === "registry:ui")) {
      const name = (item.files[0] ?? "").split("/").at(-1) ?? "";
      expect(existsSync(join(root, "src/components/ui", name)), `${name} was not written`).toBe(
        true,
      );
    }
    expect(existsSync(join(root, "src/components/blocks"))).toBe(false);
  });

  test("view prints an item as the registry serves it, before there is a project", async () => {
    const result = await barq(root, "view", "badge");
    expect(result.code).toBe(0);
    const items = JSON.parse(result.out) as {
      name: string;
      type: string;
      files: { path: string; content: string }[];
    }[];
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("badge");
    expect(items[0]?.type).toBe("registry:ui");
    expect(items[0]?.files[0]?.content).toContain("badgeVariants");
    expect(existsSync(join(root, "components.json"))).toBe(false);
  });

  test("view of something the registry does not have names it", async () => {
    const result = await barq(root, "view", "nonesuch");
    expect(result.code).toBe(1);
    expect(result.out).toContain("nonesuch");
  });

  test("search finds by name, by description and by category", async () => {
    const byName = await barq(root, "search", "sidebar");
    expect(byName.code).toBe(0);
    expect(byName.out).toContain("sidebar-07");
    expect(byName.out).toMatch(/^\s+sidebar\s+ui/m);
    expect(byName.out).not.toContain("login-01");

    const byCategory = await barq(root, "search", "authentication");
    expect(byCategory.out).toContain("login-01");
    expect(byCategory.out).toContain("signup-05");
    expect(byCategory.out).not.toContain("sidebar-07");

    const both = await barq(root, "search", "sidebar", "calendar");
    expect(both.out).toContain("sidebar-12");
    expect(both.out).not.toContain("sidebar-07");
  });

  test("search --json is the same answer as data", async () => {
    const result = await barq(root, "search", "charts", "--json");
    const found = JSON.parse(result.out) as {
      items: { name: string; type: string; categories: string[] }[];
      errors: string[];
    };
    expect(found.errors).toEqual([]);
    expect(found.items.map((item) => item.name)).toContain("chart-area");
    const area = found.items.find((item) => item.name === "chart-area");
    expect(area?.type).toBe("registry:block");
    expect(area?.categories).toEqual(["charts"]);
  });

  test("search with nothing to find says so", async () => {
    const result = await barq(root, "search", "zzzznothing");
    expect(result.code).toBe(0);
    expect(result.out).toContain("Nothing matches");
  });

  test("info says what the project is set up with", async () => {
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    await barq(root, "init", "--yes", "--theme", "zinc");
    await barq(root, "add", "badge");

    const result = await barq(root, "info", "--json");
    expect(result.code).toBe(0);
    const facts = JSON.parse(result.out) as {
      root: string;
      config: string;
      registry: string;
      paths: Record<string, string>;
      theme: { base: string };
      packageManager: string;
      items: string[];
    };
    expect(facts.config.endsWith("components.json")).toBe(true);
    expect(facts.registry).toBe("node_modules");
    expect(facts.paths["components"]).toBe("src/components");
    expect(facts.paths["hooks"]).toBe("src/hooks");
    expect(facts.theme.base).toBe("zinc");
    expect(facts.packageManager).toBe("pnpm");
    expect(facts.items).toContain("badge");

    const read = await barq(root, "info");
    expect(read.out).toContain("pnpm");
    expect(read.out).toContain("zinc");
  });

  test("info before init says there is no config rather than failing", async () => {
    const result = await barq(root, "info");
    expect(result.code).toBe(0);
    expect(result.out).toContain("barq-ui init");
  });
});

/**
 * A package manager that records what it was asked for and installs nothing.
 *
 * On `PATH` ahead of the real one, so the command the CLI runs is the command
 * the test reads, and no network is involved in finding out.
 */
function recorder(root: string, name: string): { env: Record<string, string>; log: string } {
  const bin = join(root, ".bin");
  const log = join(root, "install.log");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, name), `#!/bin/sh\necho "$PWD $@" >> "${log}"\n`);
  chmodSync(join(bin, name), 0o755);
  return { env: { PATH: `${bin}:${process.env["PATH"] ?? ""}` }, log };
}

describe.if(ready)("installing what an item needs", () => {
  let root = "";

  beforeEach(() => {
    root = project();
  });

  test("add runs the project's own package manager, in the project", async () => {
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    const pnpm = recorder(root, "pnpm");
    await barq(root, "init", "--yes");

    const result = await spawn(root, ["add", "dialog"], pnpm.env);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Installing what they need");

    const ran = readFileSync(pnpm.log, "utf8").trim().split("\n");
    expect(ran).toHaveLength(1);
    expect(ran[0]).toContain(" add ");
    expect(ran[0]).toContain("@barqjs/aria");
    expect(ran[0]).toContain("@barqjs/css");
    expect(realpathSync((ran[0] ?? "").split(" ")[0] ?? "")).toBe(realpathSync(root));
  });

  test("--no-install names the command and runs nothing", async () => {
    writeFileSync(join(root, "yarn.lock"), "");
    const yarn = recorder(root, "yarn");
    await barq(root, "init", "--yes");

    const result = await spawn(root, ["add", "dialog", "--no-install"], yarn.env);
    expect(result.out).toContain("Install what they need");
    expect(result.out).toMatch(/yarn add .*@barqjs\/aria/);
    expect(existsSync(yarn.log)).toBe(false);
  });

  test("nothing is installed when the project already has it all", async () => {
    writeFileSync(join(root, "bun.lock"), "");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "probe",
        private: true,
        type: "module",
        dependencies: {
          "@barqjs/core": "*",
          "@barqjs/css": "*",
          "@barqjs/aria": "*",
          "@barqjs/primitives": "*",
        },
      }),
    );
    const bun = recorder(root, "bun-recorded");
    await barq(root, "init", "--yes");
    const result = await spawn(root, ["add", "kbd"], bun.env);
    expect(result.code).toBe(0);
    expect(result.out).not.toContain("Installing");
    expect(existsSync(bun.log)).toBe(false);
  });

  test("a package manager that fails is an error, after the files are written", async () => {
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    const bin = join(root, ".bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "pnpm"), "#!/bin/sh\nexit 3\n");
    chmodSync(join(bin, "pnpm"), 0o755);
    await barq(root, "init", "--yes");

    const result = await spawn(root, ["add", "dialog"], {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    });
    expect(result.code).toBe(1);
    expect(result.out).toContain("exited with 3");
    expect(existsSync(join(root, "src/components/ui/dialog.tsx"))).toBe(true);
  });

  test("a dry run installs nothing either", async () => {
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    const pnpm = recorder(root, "pnpm");
    await barq(root, "init", "--yes");

    const result = await spawn(root, ["add", "dialog", "--dry-run"], pnpm.env);
    expect(result.out).toContain("Would install");
    expect(result.out).toMatch(/pnpm add .*@barqjs\/aria/);
    expect(existsSync(pnpm.log)).toBe(false);
  });
});

describe.if(ready)("a registry of one's own, by its scope", () => {
  let root = "";

  beforeEach(() => {
    root = project();
  });

  function serve(directory: string, items: Record<string, unknown>): void {
    mkdirSync(join(root, directory), { recursive: true });
    for (const [name, item] of Object.entries(items)) {
      writeFileSync(join(root, directory, `${name}.json`), JSON.stringify(item));
    }
  }

  function register(registries: Record<string, unknown>): void {
    const path = join(root, "components.json");
    const config = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...config, registries }, null, 2));
  }

  const WIDGET = {
    name: "widget",
    type: "registry:block",
    title: "Widget",
    description: "A panel with a meter in it.",
    categories: ["panels"],
    dependencies: ["d3-shape"],
    devDependencies: ["@types/d3-shape"],
    registryDependencies: ["badge", "@acme/use-meter"],
    cssVars: { light: { meter: "oklch(0.7 0.2 150)" }, dark: { meter: "oklch(0.5 0.2 150)" } },
    css: { "@keyframes meter-fill": { from: { width: "0" } } },
    files: [
      {
        path: "blocks/widget/widget.tsx",
        type: "registry:block",
        content:
          'import { Badge } from "../../ui/badge.tsx";\nimport { useMeter } from "../../hooks/use-meter.ts";\nimport { Meter } from "./components/meter.tsx";\nexport const Widget = [Badge, useMeter, Meter];\n',
      },
      {
        path: "blocks/widget/components/meter.tsx",
        type: "registry:component",
        content: "export const Meter = 1;\n",
      },
      {
        path: "blocks/widget/page.tsx",
        type: "registry:page",
        target: "src/routes/widget.tsx",
        content: 'import { Widget } from "./widget.tsx";\nexport default Widget;\n',
      },
      {
        path: "blocks/widget/env",
        type: "registry:file",
        target: "~/.env.example",
        content: "API_TOKEN=\n",
      },
    ],
  };

  const USE_METER = {
    name: "use-meter",
    type: "registry:hook",
    files: [
      {
        path: "hooks/use-meter.ts",
        type: "registry:hook",
        content: "export const useMeter = 1;\n",
      },
    ],
  };

  test("@scope/name comes from the registry that scope names, with what it needs", async () => {
    await barq(root, "init", "--yes");
    serve("acme", { widget: WIDGET, "use-meter": USE_METER });
    register({ "@acme": "./acme/{name}.json" });

    const result = await barq(root, "add", "@acme/widget");
    expect(result.code).toBe(0);

    for (const path of [
      "src/components/blocks/widget/widget.tsx",
      "src/components/blocks/widget/components/meter.tsx",
      "src/routes/widget.tsx",
      ".env.example",
      "src/hooks/use-meter.ts",
      "src/components/ui/badge.tsx",
    ]) {
      expect(existsSync(join(root, path)), `${path} was not written`).toBe(true);
    }

    const widget = file(root, "src/components/blocks/widget/widget.tsx");
    expect(widget).toContain('from "../../ui/badge.tsx"');
    expect(widget).toContain('from "../../../hooks/use-meter.ts"');
    expect(widget).toContain('from "./components/meter.tsx"');
    // The page went where its target said, so its import follows the block.
    expect(file(root, "src/routes/widget.tsx")).toContain(
      'from "../components/blocks/widget/widget.tsx"',
    );

    const config = JSON.parse(file(root, "components.json")) as {
      registries: Record<string, string>;
      items: Record<string, Record<string, string>>;
    };
    expect(config.registries["@acme"]).toBe("./acme/{name}.json");
    // Under its whole address: a `widget` of the project's own registry would
    // otherwise be the same record.
    expect(Object.keys(config.items["@acme/widget"] ?? {}).toSorted()).toEqual([
      "blocks/widget/components/meter.tsx",
      "blocks/widget/env",
      "blocks/widget/page.tsx",
      "blocks/widget/widget.tsx",
    ]);
    expect(config.items["@acme/use-meter"]).toBeDefined();
    expect(config.items["badge"]).toBeDefined();
  });

  test("its tokens and rules are written into the theme, and kept when the theme changes", async () => {
    await barq(root, "init", "--yes");
    serve("acme", { widget: WIDGET, "use-meter": USE_METER });
    register({ "@acme": "./acme/{name}.json" });
    await barq(root, "add", "@acme/widget");

    const theme = file(root, "src/components/theme/theme.ts");
    expect(theme).toContain("--meter: oklch(0.7 0.2 150);");
    expect(theme).toContain("--meter: oklch(0.5 0.2 150);");
    expect(theme).toContain("@keyframes meter-fill");
    expect(theme).toContain("--primary: oklch(0.205 0 0)");

    await barq(root, "theme", "blue");
    const changed = file(root, "src/components/theme/theme.ts");
    expect(changed).toContain("Neutral with Blue");
    expect(changed).toContain("--meter: oklch(0.7 0.2 150);");
  });

  test("a theme the project has edited is left alone, and said to be", async () => {
    await barq(root, "init", "--yes");
    serve("acme", { widget: WIDGET, "use-meter": USE_METER });
    register({ "@acme": "./acme/{name}.json" });
    const path = join(root, "src/components/theme/theme.ts");
    const edited = `${readFileSync(path, "utf8")}\n// mine\n`;
    writeFileSync(path, edited);

    const result = await barq(root, "add", "@acme/widget");
    expect(result.out).toContain("left alone");
    expect(readFileSync(path, "utf8")).toBe(edited);

    await barq(root, "add", "@acme/widget", "--overwrite");
    expect(readFileSync(path, "utf8")).toContain("--meter:");
  });

  test("what it needs to build is installed as a development dependency", async () => {
    await barq(root, "init", "--yes");
    serve("acme", { widget: WIDGET, "use-meter": USE_METER });
    register({ "@acme": "./acme/{name}.json" });
    writeFileSync(join(root, "pnpm-lock.yaml"), "");

    const printed = await barq(root, "add", "@acme/widget");
    expect(printed.out).toMatch(/pnpm add .*d3-shape/);
    expect(printed.out).toContain("pnpm add -D @types/d3-shape");
  });

  test("view and search reach it too", async () => {
    await barq(root, "init", "--yes");
    serve("acme", {
      widget: WIDGET,
      index: {
        name: "acme",
        items: [
          {
            name: "widget",
            type: "registry:block",
            description: WIDGET.description,
            categories: WIDGET.categories,
          },
        ],
      },
    });
    register({ "@acme": "./acme/{name}.json" });

    const viewed = await barq(root, "view", "@acme/widget");
    const items = JSON.parse(viewed.out) as { name: string; categories: string[] }[];
    expect(items[0]?.name).toBe("@acme/widget");
    expect(items[0]?.categories).toEqual(["panels"]);

    const found = await barq(root, "search", "meter");
    expect(found.out).toContain("@acme/widget");
  });

  test("a registry that is down does not hide what the others have", async () => {
    await barq(root, "init", "--yes");
    register({ "@gone": "./gone/{name}.json" });
    const result = await barq(root, "search", "badge");
    expect(result.code).toBe(0);
    expect(result.out).toContain("badge");
    expect(result.out).toContain("@gone");
  });

  test("a scope components.json does not name says which ones it does", async () => {
    await barq(root, "init", "--yes");
    register({ "@acme": "./acme/{name}.json" });
    const result = await barq(root, "add", "@other/widget");
    expect(result.code).toBe(1);
    expect(result.out).toContain('no registry named "@other"');
    expect(result.out).toContain("@acme");
  });

  test("a target that leaves the project is refused, and nothing is written", async () => {
    await barq(root, "init", "--yes");
    serve("acme", {
      escape: {
        name: "escape",
        type: "registry:file",
        files: [
          { path: "ok.ts", type: "registry:lib", content: "export {};\n" },
          { path: "x", type: "registry:file", target: "../outside.txt", content: "x" },
        ],
      },
    });
    register({ "@acme": "./acme/{name}.json" });

    const result = await barq(root, "add", "@acme/escape");
    expect(result.code).toBe(1);
    expect(result.out).toContain("outside the project");
    expect(existsSync(join(root, "../outside.txt"))).toBe(false);
    expect(existsSync(join(root, "src/components/lib/ok.ts"))).toBe(false);
  });

  test("a registry over HTTP is sent the headers its entry names, from the environment", async () => {
    await barq(root, "init", "--yes");
    const seen: (string | null)[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        seen.push(request.headers.get("authorization"));
        const name = new URL(request.url).pathname.replace(/^\/r\//, "").replace(/\.json$/, "");
        return name === "use-meter"
          ? Response.json(USE_METER)
          : new Response("no", { status: 404 });
      },
    });
    try {
      register({
        "@private": {
          url: `http://localhost:${String(server.port)}/r/{name}.json`,
          headers: { Authorization: "Bearer ${API_TOKEN}" },
        },
      });

      // The token is the environment's and nowhere else, so without it the
      // request is not made at all rather than made unauthenticated.
      const unset = await barq(root, "add", "@private/use-meter");
      expect(unset.code).toBe(1);
      expect(unset.out).toContain("API_TOKEN");
      expect(seen).toEqual([]);

      const env = { API_TOKEN: "s3cret" };
      const result = await spawn(root, ["add", "@private/use-meter", "--no-install"], env);
      expect(result.code).toBe(0);
      expect(seen).toEqual(["Bearer s3cret"]);
      expect(existsSync(join(root, "src/hooks/use-meter.ts"))).toBe(true);

      const missing = await spawn(root, ["add", "@private/nonesuch", "--no-install"], env);
      expect(missing.code).toBe(1);
      expect(missing.out).toContain("404");
    } finally {
      await server.stop(true);
    }
  });
});
