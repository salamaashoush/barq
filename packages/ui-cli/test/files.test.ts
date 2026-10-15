import { describe, expect, test } from "bun:test";

import { directoryFor, hashOf, placed, rewrite, targetOf } from "../src/files.ts";
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

describe("where the newer types go", () => {
  const typed = (path: string, type: RegistryFile["type"], target?: string): RegistryFile => ({
    path,
    type,
    content: "",
    ...(target === undefined ? {} : { target }),
  });

  test("a hook has a directory of its own", () => {
    expect(directoryFor(config, root, "registry:hook")).toBe("/project/hooks");
    expect(targetOf(config, root, typed("hooks/use-mobile.ts", "registry:hook"))).toBe(
      "/project/hooks/use-mobile.ts",
    );
  });

  test("a block keeps the tree it was written as, under components", () => {
    expect(targetOf(config, root, typed("blocks/login-01.tsx", "registry:block"))).toBe(
      "/project/app/blocks/login-01.tsx",
    );
    expect(
      targetOf(config, root, typed("blocks/dashboard-01/components/chart.tsx", "registry:block")),
    ).toBe("/project/app/blocks/dashboard-01/components/chart.tsx");
  });

  test("a component under `components/` is not nested in a second one", () => {
    expect(targetOf(config, root, typed("components/charts/area.tsx", "registry:component"))).toBe(
      "/project/app/charts/area.tsx",
    );
    expect(targetOf(config, root, typed("charts/area.tsx", "registry:component"))).toBe(
      "/project/app/charts/area.tsx",
    );
  });

  test("a target is from the project root, whatever the type", () => {
    expect(
      targetOf(config, root, typed("login/page.tsx", "registry:page", "src/routes/login.tsx")),
    ).toBe("/project/src/routes/login.tsx");
    expect(targetOf(config, root, typed("env", "registry:file", "~/.env.example"))).toBe(
      "/project/.env.example",
    );
    expect(targetOf(config, root, typed("ui/button.tsx", "registry:ui", "lib/b.tsx"))).toBe(
      "/project/lib/b.tsx",
    );
  });

  test("nothing a registry says can write outside the project", () => {
    expect(() => targetOf(config, root, typed("x", "registry:file", "../../etc/profile"))).toThrow(
      /outside the project/,
    );
    expect(() => targetOf(config, root, typed("x", "registry:file", "/etc/profile"))).toThrow(
      /outside the project/,
    );
    expect(() => targetOf(config, root, typed("blocks/../../../x.tsx", "registry:block"))).toThrow(
      /outside the project/,
    );
  });
});

describe("rewriting imports", () => {
  test("a block reaches the ui it was written against, wherever ui was put", () => {
    const block: RegistryFile = {
      path: "blocks/login-01.tsx",
      type: "registry:block",
      content: 'import { Card } from "../ui/card.tsx";\nimport { fill } from "../lib/layout.ts";',
    };
    expect(rewrite(config, root, block)).toBe(
      'import { Card } from "../ui/card.tsx";\nimport { fill } from "../lib/layout.ts";',
    );

    const apart = parseConfig({
      paths: { ui: "src/ui", lib: "src/shared", theme: "src/theme", components: "src/features" },
    });
    expect(rewrite(apart, root, block)).toBe(
      'import { Card } from "../../ui/card.tsx";\nimport { fill } from "../../shared/layout.ts";',
    );
  });

  test("a file travelling with it is found where its own type and target put it", () => {
    const page: RegistryFile = {
      path: "blocks/login/page.tsx",
      type: "registry:page",
      target: "src/routes/login.tsx",
      content: 'import { LoginForm } from "./components/login-form.tsx";',
    };
    const form: RegistryFile = {
      path: "blocks/login/components/login-form.tsx",
      type: "registry:component",
      content: "",
    };
    const together = placed([{ files: [page, form] }]);
    expect(rewrite(config, root, page, together)).toBe(
      'import { LoginForm } from "../../app/blocks/login/components/login-form.tsx";',
    );
  });

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
