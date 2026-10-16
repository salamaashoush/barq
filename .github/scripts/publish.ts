/**
 * Publishes every workspace package whose version is not on npm yet.
 *
 *   bun .github/scripts/publish.ts --list        # how many versions are unpublished
 *   bun .github/scripts/publish.ts --dry-run     # check every package, `npm publish --dry-run` the unpublished
 *   bun .github/scripts/publish.ts --dry-run --require-binaries   # the same, with every binding built
 *   bun .github/scripts/publish.ts               # the release; CI only
 *
 * Not `changeset publish`: it hands the package directory to `npm publish`,
 * which leaves `workspace:*` in the manifest because only the workspace's own
 * package manager knows what it means. Each package is packed with
 * `bun pm pack` instead, which rewrites the ranges, and the tarball is what npm
 * publishes. Every tarball is packed and checked before the first one is
 * published, so a bad package stops the release rather than half of it.
 *
 * A prerelease goes to the dist-tag pre mode names (`next`), except for a
 * package npm has never seen, which goes to `latest` as `changeset publish`
 * does: a package with no `latest` tag cannot be installed by name. Each
 * published version is written to `$CHANGESETS_OUTPUT`, which is how
 * changesets/action learns what to tag and release.
 */
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkManifest,
  checkTarball,
  isPlatformBinding,
  pack,
  root,
  workspaces,
  type Workspace,
} from "./package-quality.ts";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const listOnly = args.has("--list");
const requireBinaries = !dryRun || args.has("--require-binaries");

function npm(argv: string[]): { code: number; out: string } {
  const result = Bun.spawnSync({
    cmd: ["npm", ...argv],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, out: `${result.stdout.toString()}${result.stderr.toString()}` };
}

function publishedVersions(name: string): string[] {
  const result = npm(["view", name, "versions", "--json"]);
  if (result.code !== 0) {
    if (/E404|404 Not Found/.test(result.out)) return [];
    throw new Error(`npm view ${name} failed:\n${result.out}`);
  }
  const parsed = JSON.parse(result.out) as string | string[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Dependencies first, so nothing is published before what it installs. */
function inOrder(packages: Workspace[]): Workspace[] {
  const byName = new Map(packages.map((one) => [one.manifest.name, one]));
  const done = new Set<string>();
  const ordered: Workspace[] = [];
  const visit = (one: Workspace): void => {
    if (done.has(one.manifest.name)) return;
    done.add(one.manifest.name);
    const { dependencies, peerDependencies, optionalDependencies } = one.manifest;
    for (const name of Object.keys({
      ...dependencies,
      ...peerDependencies,
      ...optionalDependencies,
    })) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency);
    }
    ordered.push(one);
  };
  for (const one of packages) visit(one);
  return ordered;
}

function preTag(): string {
  const path = join(root, ".changeset/pre.json");
  if (!existsSync(path)) return "next";
  const state = JSON.parse(readFileSync(path, "utf8")) as { mode: string; tag: string };
  return state.mode === "pre" ? state.tag : "next";
}

const all = workspaces();
const candidates = inOrder(all.filter((one) => !one.manifest.private));
const plan = candidates.map((one) => ({
  workspace: one,
  versions: publishedVersions(one.manifest.name),
}));
const pending = plan.filter(
  ({ workspace, versions }) => !versions.includes(workspace.manifest.version),
);

if (listOnly) {
  for (const { workspace } of pending) {
    console.error(`unpublished: ${workspace.manifest.name}@${workspace.manifest.version}`);
  }
  console.log(`count=${pending.length}`);
  process.exit(0);
}

const targets = dryRun ? plan : pending;
if (targets.length === 0) {
  console.log("Every version is already on npm.");
  process.exit(0);
}

const destination = mkdtempSync(join(tmpdir(), "barq-release-"));
try {
  const tarballs = new Map<string, string>();
  let failed = false;
  for (const { workspace, versions } of targets) {
    const { name, version } = workspace.manifest;
    const problems = checkManifest(workspace, all);
    const newer = versions.filter((published) => Bun.semver.order(published, version) > 0);
    if (newer.length > 0) {
      problems.push(`npm already has ${newer.join(", ")}, newer than ${version}`);
    }
    const tarball = pack(workspace, destination);
    if (tarball === null) {
      if (requireBinaries) problems.push(`${workspace.manifest.main} has not been built`);
      else {
        console.log(
          `skip  ${name}@${version}: ${workspace.manifest.main} is not built on this machine`,
        );
        continue;
      }
    } else problems.push(...(await checkTarball(workspace, tarball)));
    if (problems.length > 0) {
      failed = true;
      console.log(`FAIL  ${name}@${version}`);
      for (const problem of problems) console.log(`      ${problem.split("\n").join("\n      ")}`);
    } else {
      console.log(`ok    ${name}@${version}`);
      tarballs.set(name, tarball as string);
    }
  }
  if (failed) {
    console.log("\nNothing was published.");
    process.exit(1);
  }

  const prerelease = preTag();
  for (const { workspace, versions } of targets) {
    const { name, version } = workspace.manifest;
    if (!tarballs.has(name) || versions.includes(version)) continue;
    const tag = !version.includes("-") || versions.length === 0 ? "latest" : prerelease;
    const argv = ["publish", tarballs.get(name) as string, "--access", "public", "--tag", tag];
    if (dryRun) argv.push("--dry-run");
    console.log(`${dryRun ? "would publish" : "publishing"} ${name}@${version} under ${tag}`);
    const result = npm(argv);
    if (result.code !== 0) {
      console.log(result.out);
      process.exit(1);
    }
    if (!dryRun && process.env.CHANGESETS_OUTPUT && !isPlatformBinding(workspace.manifest)) {
      const event = { type: "git-tag", tag: `${name}@${version}`, packageName: name };
      appendFileSync(process.env.CHANGESETS_OUTPUT, `${JSON.stringify(event)}\n`);
    }
  }
} finally {
  rmSync(destination, { recursive: true, force: true });
}
