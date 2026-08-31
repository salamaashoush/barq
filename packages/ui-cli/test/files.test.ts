import { describe, expect, test } from "bun:test";

import { directoryFor, hashOf, rewrite, targetOf } from "../src/files.ts";
import { parseConfig, type RegistryFile } from "../src/schema.ts";

const config = parseConfig({
  paths: { ui: "app/ui", lib: "app/lib", theme: "app/theme" },
});

const root = "/project";

function file(path: string, content: string): RegistryFile {
  return {
    path,
    type: path.startsWith("lib/")
      ? "registry:lib"
      : path.startsWith("theme/")
        ? "registry:theme"
        : "registry:ui",
    content,
  };
}

describe("where a file goes", () => {
  test("its type chooses the directory", () => {
    expect(directoryFor(config, root, "registry:ui")).toBe("/project/app/ui");
    expect(directoryFor(config, root, "registry:lib")).toBe("/project/app/lib");
    expect(directoryFor(config, root, "registry:theme")).toBe("/project/app/theme");
  });

  test("the file keeps its own name", () => {
    expect(targetOf(config, root, file("ui/button.tsx", ""))).toBe("/project/app/ui/button.tsx");
  });
});

describe("rewriting imports", () => {
  test("a sibling stays a sibling", () => {
    const out = rewrite(
      config,
      root,
      file("ui/dialog.tsx", 'import { Button } from "./button.tsx";'),
    );
    expect(out).toBe('import { Button } from "./button.tsx";');
  });

  test("a cross-directory import is recomputed against where both land", () => {
    const out = rewrite(
      config,
      root,
      file("ui/dialog.tsx", 'import { uiProps } from "../lib/slot.ts";'),
    );
    expect(out).toBe('import { uiProps } from "../lib/slot.ts";');
  });

  test("a layout that flattens the directories changes the path", () => {
    const flat = parseConfig({ paths: { ui: "src/ui", lib: "src/ui", theme: "src/ui" } });
    const out = rewrite(
      flat,
      root,
      file("ui/dialog.tsx", 'import { uiProps } from "../lib/slot.ts";'),
    );
    expect(out).toBe('import { uiProps } from "./slot.ts";');
  });

  test("a layout that separates them further changes it the other way", () => {
    const apart = parseConfig({
      paths: { ui: "src/components", lib: "src/internal/lib", theme: "src/theme" },
    });
    const out = rewrite(
      apart,
      root,
      file("ui/dialog.tsx", 'import { uiProps } from "../lib/slot.ts";'),
    );
    expect(out).toBe('import { uiProps } from "../internal/lib/slot.ts";');
  });

  test("a bare side-effect import is rewritten too", () => {
    const apart = parseConfig({ paths: { ui: "src/ui", lib: "src/lib", theme: "styles" } });
    const out = rewrite(apart, root, file("ui/button.tsx", 'import "../theme/layers.ts";'));
    expect(out).toBe('import "../../styles/layers.ts";');
  });

  test("a package import is left exactly as it was", () => {
    const source =
      'import { css } from "@barqjs/css";\nimport { X } from "@barqjs/lucide/icons/x";';
    expect(rewrite(config, root, file("ui/button.tsx", source))).toBe(source);
  });

  test("a quoted string that is not an import is untouched", () => {
    const source = 'export const kind = "./not-an-import";';
    expect(rewrite(config, root, file("ui/button.tsx", source))).toBe(source);
  });
});

describe("hashOf", () => {
  test("is stable and short", () => {
    expect(hashOf("a")).toBe(hashOf("a"));
    expect(hashOf("a")).toHaveLength(16);
  });

  test("one changed byte changes it", () => {
    expect(hashOf("a")).not.toBe(hashOf("b"));
  });
});
