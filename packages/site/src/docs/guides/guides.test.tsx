import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { parseConfig, parseItem } from "../../../../ui-cli/src/schema.ts";
import { MONTHS } from "./changelog.tsx";
import { COMMANDS, GLOBAL_OPTIONS } from "./cli.tsx";
import { REGISTRIES, SAMPLE } from "./components-json.tsx";
import { PAGES } from "./index.ts";
import { COMMANDS as INSTALL } from "./installation.tsx";
import { ITEM } from "./registry.tsx";
import ModeToggle from "./snippets/dark-mode/mode-toggle.tsx";
import BugReport from "./snippets/forms/bug-report.tsx";
import RtlExample from "./snippets/rtl/rtl-example.tsx";
import { hydrateGuide } from "./test-harness.ts";
import { STYLES, TOKENS } from "./theming.tsx";

const packages = fileURLToPath(new URL("../../../../", import.meta.url));

describe("the guides", () => {
  for (const guide of PAGES) {
    test(`${guide.slug} is claimed from the server's markup, with an anchor per section`, async () => {
      const result = await hydrateGuide(guide.slug);
      expect(result.mismatches).toEqual([]);
      expect(result.recovered).toBe(false);
      expect(result.reuse).toBe(1);
      for (const section of guide.sections) {
        expect(
          result.container.querySelector(`h2[id="${section.id}"]`),
          `${guide.slug} has no heading for ${section.id}`,
        ).not.toBeNull();
      }
      result.unmount();
    });
  }
});

describe("what the guides say, against what the packages do", () => {
  const help = Bun.spawnSync([
    "bun",
    join(packages, "ui-cli/src/index.ts"),
    "--help",
  ]).stdout.toString();

  test("the CLI page documents every command the CLI has, and no other", () => {
    const real = [...help.matchAll(/^ {2}([a-z]+)(?: [<[][^ ]+)? {2,}\S/gm)].map(
      (found) => found[1],
    );
    expect(COMMANDS.map((command) => command.name)).toEqual(real as string[]);
  });

  test("every flag the CLI page names is one the CLI prints in its help", () => {
    const flags = [...COMMANDS.flatMap((command) => command.options), ...GLOBAL_OPTIONS].flatMap(
      (option) => option.flag.match(/--?[a-z][a-z-]*/g) ?? [],
    );
    expect(flags.length).toBeGreaterThan(15);
    for (const flag of flags) expect(help, `${flag} is not in the help`).toContain(flag);
  });

  test("every flag in the help is on the page", () => {
    const documented = new Set(
      [...COMMANDS.flatMap((command) => command.options), ...GLOBAL_OPTIONS].flatMap(
        (option) => option.flag.match(/--[a-z][a-z-]*/g) ?? [],
      ),
    );
    const real = [...help.matchAll(/(--[a-z][a-z-]*)/g)].map((found) => found[1] as string);
    expect(real.filter((flag) => !documented.has(flag))).toEqual([]);
  });

  test("the components.json on the page loads through the CLI's own parser", () => {
    const config = parseConfig(JSON.parse(SAMPLE));
    expect(config.registry).toBeUndefined();
    expect(config.paths.ui).toBe("src/components/ui");
    const scoped = parseConfig({ ...JSON.parse(SAMPLE), ...JSON.parse(REGISTRIES) });
    expect(Object.keys(scoped.registries ?? {})).toEqual(["@acme", "@private"]);
  });

  test("the registry item on the page is one the CLI accepts", () => {
    const item = parseItem(JSON.parse(ITEM));
    expect(item.name).toBe("pricing-table");
    expect(item.files).toHaveLength(1);
    expect(item.registryDependencies).toEqual(["button", "card"]);
  });

  test("every command the installation page runs is one the CLI has", () => {
    for (const command of INSTALL) expect(help, command).toContain(`  ${command} `);
  });

  test("every component the changelog names is one the package has", () => {
    const named = MONTHS.flatMap((month) => month.entries.flatMap((entry) => entry.pages ?? []));
    expect(named.length).toBeGreaterThan(20);
    for (const slug of named) {
      const file = join(packages, "ui/src/ui", slug);
      expect(existsSync(`${file}.tsx`) || existsSync(`${file}.ts`), slug).toBe(true);
    }
  });

  test("every token and style the theming page names exists", () => {
    const theme = readFileSync(join(packages, "site/src/theme.ts"), "utf8");
    for (const token of TOKENS) expect(theme, token.name).toContain(`${token.name}:`);
    const styles = readdirSync(join(packages, "ui/styles")).map((file) =>
      file.replace(/\.css$/, ""),
    );
    const named: string[] = [...STYLES];
    expect(named.toSorted()).toEqual(styles.toSorted());
  });
});

describe("the live examples", () => {
  test("the mode toggle moves the dark class and remembers the choice", async () => {
    localStorage.removeItem("theme");
    render(() => <ModeToggle />);
    const surface = document.querySelector('[data-slot="mode"]') as HTMLElement;
    expect(surface.classList.contains("dark")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    flush();
    expect(surface.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    flush();
    expect(surface.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  test("the right-to-left example names its direction and reads it in scope", () => {
    render(() => <RtlExample />);
    const reading = screen.getByRole("status");
    expect(reading.textContent).toBe("rtl");
    expect(reading.closest("[dir]")?.getAttribute("dir")).toBe("rtl");
  });

  test("the bug report shows its errors when submitted empty, and its values when it is fine", async () => {
    render(() => <BugReport />);
    const title = screen.getByLabelText("Bug Title") as HTMLInputElement;
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    const sent = document.querySelector('[data-slot="submitted"]') as HTMLElement;

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await tick();
    flush();
    expect(document.body.textContent).toContain("Bug title must be at least 5 characters.");
    expect(document.body.textContent).toContain("Description must be at least 20 characters.");
    expect(sent.textContent?.trim()).toBe("");

    await user.type(title, "Login button broken");
    await user.type(description, "The login button does nothing on a phone.");
    flush();
    expect(title.value).toBe("Login button broken");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    for (let turn = 0; turn < 5; turn += 1) await tick();
    flush();
    expect(document.body.textContent).not.toContain("must be at");
    expect(JSON.parse(sent.textContent ?? "")).toEqual({
      title: "Login button broken",
      description: "The login button does nothing on a phone.",
    });
    expect(document.body.textContent).not.toContain("must be at least");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    flush();
    expect(title.value).toBe("");
    expect(sent.textContent?.trim()).toBe("");
  });
});
