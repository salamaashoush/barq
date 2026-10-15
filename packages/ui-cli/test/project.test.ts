import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installArguments, installedPackages, packageManager } from "../src/project.ts";

const workspaces: string[] = [];

afterAll(() => {
  for (const workspace of workspaces) rmSync(workspace, { recursive: true, force: true });
});

function directory(files: readonly string[] = []): string {
  const workspace = mkdtempSync(join(tmpdir(), "barq-ui-cli-pm-"));
  workspaces.push(workspace);
  for (const file of files) writeFileSync(join(workspace, file), "");
  return workspace;
}

describe("the package manager", () => {
  test("is the one whose lockfile the project has", () => {
    expect(packageManager(directory(["bun.lock"]))).toBe("bun");
    expect(packageManager(directory(["bun.lockb"]))).toBe("bun");
    expect(packageManager(directory(["pnpm-lock.yaml"]))).toBe("pnpm");
    expect(packageManager(directory(["yarn.lock"]))).toBe("yarn");
    expect(packageManager(directory(["package-lock.json"]))).toBe("npm");
  });

  test("is the workspace's, when the lockfile is above the package", () => {
    const workspace = directory(["pnpm-lock.yaml"]);
    const inner = join(workspace, "packages/app");
    mkdirSync(inner, { recursive: true });
    expect(packageManager(inner)).toBe("pnpm");
  });

  test("the nearest lockfile wins over one further up", () => {
    const workspace = directory(["yarn.lock"]);
    const inner = join(workspace, "apps/site");
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(inner, "bun.lock"), "");
    expect(packageManager(inner)).toBe("bun");
  });
});

describe("the install command", () => {
  test("npm installs and the other three add", () => {
    expect(installArguments("npm", ["a", "b"])).toEqual(["npm", "install", "a", "b"]);
    expect(installArguments("pnpm", ["a"])).toEqual(["pnpm", "add", "a"]);
    expect(installArguments("yarn", ["a"])).toEqual(["yarn", "add", "a"]);
    expect(installArguments("bun", ["a"])).toEqual(["bun", "add", "a"]);
  });

  test("a development dependency is flagged the way all four spell it", () => {
    for (const manager of ["npm", "pnpm", "yarn", "bun"] as const) {
      expect(installArguments(manager, ["a"], { dev: true })).toContain("-D");
    }
  });
});

describe("what is installed", () => {
  test("is every dependency field of the manifest", () => {
    const workspace = directory();
    writeFileSync(
      join(workspace, "package.json"),
      JSON.stringify({
        dependencies: { a: "1" },
        devDependencies: { b: "1" },
        peerDependencies: { c: "1" },
      }),
    );
    expect([...installedPackages(workspace)].toSorted()).toEqual(["a", "b", "c"]);
  });

  test("is nothing, for a directory with no manifest", () => {
    expect(installedPackages(directory()).size).toBe(0);
  });
});
