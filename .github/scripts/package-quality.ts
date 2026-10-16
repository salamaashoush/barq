/**
 * Packs every publishable workspace package and checks what would reach npm.
 *
 *   bun .github/scripts/package-quality.ts                     # every package
 *   bun .github/scripts/package-quality.ts @barqjs/core        # some of them
 *   bun .github/scripts/package-quality.ts --require-binaries  # release: no binding may be missing
 *
 * The tarball is what is judged, not the directory: `bun pm pack` is what
 * rewrites `workspace:*` and applies `files`, so a check of the working tree
 * passes on a package that installs broken. Each one is also put through
 * publint and Are the Types Wrong. Run `bun run build:packages` first.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve } from "node:path";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

export const root = resolve(import.meta.dir, "../..");
const REPOSITORY = "git+https://github.com/salamaashoush/barq.git";

type Conditions = string | null | { [key: string]: Conditions };

export interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  description?: string;
  keywords?: string[];
  homepage?: string;
  bugs?: { url?: string };
  license?: string;
  repository?: { type?: string; url?: string; directory?: string };
  files?: string[];
  type?: string;
  sideEffects?: boolean | string[];
  main?: string;
  types?: string;
  bin?: Record<string, string>;
  imports?: Record<string, Conditions>;
  exports?: Record<string, Conditions>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  libc?: string[];
  publishConfig?: { access?: string; provenance?: boolean };
  napi?: unknown;
}

export interface Workspace {
  dir: string;
  path: string;
  manifest: Manifest;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function workspaces(): Workspace[] {
  const { workspaces: globs } = readJson(join(root, "package.json")) as { workspaces: string[] };
  const found: Workspace[] = [];
  for (const pattern of globs) {
    for (const match of new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: root })) {
      const dir = dirname(match);
      found.push({ dir, path: join(root, dir), manifest: readJson(join(root, match)) as Manifest });
    }
  }
  return found.toSorted((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export const isPlatformBinding = (manifest: Manifest): boolean => Array.isArray(manifest.os);

function leaves(value: Conditions | undefined, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value !== null && value !== undefined)
    for (const inner of Object.values(value)) leaves(inner, out);
  return out;
}

function typesFirst(value: Conditions | undefined, at: string, problems: string[]): void {
  if (value === null || value === undefined || typeof value === "string") return;
  const keys = Object.keys(value);
  if (keys.includes("types") && keys[0] !== "types") {
    problems.push(`exports ${at}: "types" must be the first condition, found ${keys.join(", ")}`);
  }
  for (const key of keys) typesFirst(value[key], `${at} > ${key}`, problems);
}

function hasTypes(value: Conditions | undefined): boolean {
  if (value === null || value === undefined || typeof value === "string") return false;
  return Object.entries(value).some(([key, inner]) => key === "types" || hasTypes(inner));
}

export function checkManifest(workspace: Workspace, all: Workspace[]): string[] {
  const { manifest, dir } = workspace;
  const problems: string[] = [];
  const need = (ok: unknown, what: string): void => {
    if (!ok) problems.push(what);
  };

  need(
    typeof manifest.description === "string" && manifest.description.length > 0,
    "no description",
  );
  need(typeof manifest.license === "string" && manifest.license.length > 0, "no license");
  need(manifest.repository?.type === "git", 'repository.type is not "git"');
  need(manifest.repository?.url === REPOSITORY, `repository.url is not ${REPOSITORY}`);
  need(manifest.repository?.directory === dir, `repository.directory is not ${dir}`);
  need(manifest.homepage?.startsWith("https://"), "no homepage");
  need(manifest.bugs?.url?.startsWith("https://"), "no bugs.url");
  need(Array.isArray(manifest.keywords) && manifest.keywords.length > 0, "no keywords");
  need(
    manifest.type === "module" || manifest.type === "commonjs",
    "type is neither module nor commonjs",
  );
  need(Array.isArray(manifest.files) && manifest.files.length > 0, "no files allowlist");
  need(manifest.sideEffects !== undefined, "sideEffects is not declared");
  need(manifest.publishConfig?.access === "public", "publishConfig.access is not public");
  need(manifest.publishConfig?.provenance === true, "publishConfig.provenance is not true");

  const runsOnItsOwn =
    manifest.bin !== undefined || manifest.napi !== undefined || isPlatformBinding(manifest);
  if (runsOnItsOwn) need(manifest.engines?.node, "runs under node but declares no engines.node");

  if (isPlatformBinding(manifest)) {
    need(manifest.cpu?.length, "a platform binding without cpu");
    need(
      typeof manifest.main === "string" && manifest.main.endsWith(".node"),
      "main is not the .node binary",
    );
    if (manifest.os?.includes("linux")) need(manifest.libc?.length, "a linux binding without libc");
  } else {
    const binOnly =
      manifest.bin !== undefined && manifest.main === undefined && manifest.exports === undefined;
    if (!binOnly) need(manifest.exports !== undefined, "no exports map");
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      typesFirst(target, subpath, problems);
      if (subpath !== "./package.json" && !hasTypes(target)) {
        problems.push(`exports ${subpath} has no "types" condition`);
      }
    }
  }

  const byName = new Map(all.map((one) => [one.manifest.name, one]));
  for (const group of [
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ]) {
    for (const name of Object.keys(group ?? {})) {
      if (byName.get(name)?.manifest.private)
        problems.push(`depends on the private package ${name}`);
    }
  }
  return problems;
}

function run(cmd: string[], cwd = root): { code: number; out: string } {
  const result = Bun.spawnSync({ cmd, cwd, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, out: `${result.stdout.toString()}${result.stderr.toString()}` };
}

/**
 * The tarball for one workspace, in `destination`, or `null` for a platform
 * binding whose binary was never built on this machine.
 *
 * A binding is packed from its own directory when the binary is already there
 * (the release moves every artifact in), otherwise from a scratch copy with
 * this machine's local build added, so the working tree is never written to.
 */
export function pack(workspace: Workspace, destination: string): string | null {
  let from = workspace.path;
  let scratch: string | undefined;
  if (isPlatformBinding(workspace.manifest)) {
    const binary = workspace.manifest.main as string;
    if (!existsSync(join(from, binary))) {
      const local = join(root, "packages/compiler-rs", binary);
      if (!existsSync(local)) return null;
      scratch = mkdtempSync(join(tmpdir(), "barq-binding-"));
      cpSync(from, scratch, { recursive: true });
      cpSync(local, join(scratch, binary));
      from = scratch;
    }
  }
  try {
    const result = run(
      ["bun", "pm", "pack", "--destination", destination, "--quiet", "--ignore-scripts"],
      from,
    );
    if (result.code !== 0)
      throw new Error(`bun pm pack failed in ${workspace.dir}:\n${result.out}`);
    const tarball = result.out.trim().split("\n").pop() as string;
    return resolve(from, tarball);
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

const FORBIDDEN: [RegExp, string][] = [
  [/\.test\.[cm]?[jt]sx?$/, "a test file"],
  [/(^|\/)(__tests__|__snapshots__|fixtures?)(\/|\.[jt]sx?$)/, "test data"],
  [/(^|\/)test-(setup|helpers|root|compile|rules)\.[jt]sx?$/, "a test helper"],
  [/-(harness|probe)\.[jt]sx?$/, "a test harness"],
  [/\.types\.tsx?$/, "a type test"],
  [/^(src|dist)\/(.*\/)?tsconfig[^/]*\.json$/, "a tsconfig"],
  [/(^|\/)\.env(\.|$)/, "an environment file"],
  [/(^|\/)\.npmrc$/, "an npm config, which can hold a token"],
  [/\.(pem|key|p12|pfx)$/, "key material"],
  [/\.tsbuildinfo$/, "a build cache"],
  [/(^|\/)\.DS_Store$/, "Finder metadata"],
];

const SECRETS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bnpm_[A-Za-z0-9]{36}\b/, "an npm token"],
  [/\bgh[opsu]_[A-Za-z0-9]{36}\b/, "a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
];

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const RELATIVE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/gm;

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function resolvesIn(files: Set<string>, from: string, specifier: string): boolean {
  const base = posix.join(posix.dirname(from), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.d.ts`,
    `${base}/index.ts`,
    `${base}/index.js`,
    base.replace(/\.js$/, ".d.ts"),
    base.replace(/\.js$/, ".ts"),
  ];
  return candidates.some((candidate) => files.has(candidate));
}

function matchesTarget(files: Set<string>, target: string): boolean {
  const path = posix.normalize(target);
  if (!path.includes("*")) return files.has(path);
  const [head, tail] = path.split("*") as [string, string];
  return [...files].some((file) => file.startsWith(head) && file.endsWith(tail));
}

interface AttwProblem {
  kind: string;
  entrypoint?: string;
  resolutionKind?: string;
  resolutionOption?: string;
  fileName?: string;
  moduleSpecifier?: string;
}

/**
 * Are the Types Wrong, under the profile the package's module type calls for.
 *
 * The verdict is read from its JSON rather than from its exit code: attw 0.18
 * drops an ignored resolution only from problems that carry `resolutionKind`,
 * so an `InternalResolutionError`, which carries `resolutionOption` instead,
 * fails an `esm-only` run on the very node10 resolution the profile ignores
 * while the report prints it as "ignored per resolution".
 */
function typesProblems(tarball: string, packed: Manifest): string[] {
  const ignored = packed.type === "module" ? ["node10", "node16-cjs"] : [];
  const attw = run([join(root, "node_modules/.bin/attw"), tarball, "--format", "json"]);
  let problems: AttwProblem[];
  try {
    ({
      analysis: { problems },
    } = JSON.parse(attw.out) as { analysis: { problems: AttwProblem[] } });
  } catch {
    return [`attw did not report: ${attw.out}`];
  }
  return problems
    .filter((problem) => {
      const kind = problem.resolutionKind ?? problem.resolutionOption;
      return kind === undefined || !ignored.includes(kind);
    })
    .map(
      (problem) =>
        `attw ${problem.kind}: ${[
          problem.entrypoint,
          problem.resolutionKind ?? problem.resolutionOption,
          problem.fileName,
          problem.moduleSpecifier,
        ]
          .filter(Boolean)
          .join(" ")}`,
    );
}

export async function checkTarball(workspace: Workspace, tarball: string): Promise<string[]> {
  const problems: string[] = [];
  const unpacked = mkdtempSync(join(tmpdir(), "barq-unpacked-"));
  try {
    const extracted = run(["tar", "-xzf", tarball, "-C", unpacked]);
    if (extracted.code !== 0) return [`could not unpack ${tarball}: ${extracted.out}`];
    const base = join(unpacked, "package");
    const files = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else files.add(relative(base, full).split("\\").join("/"));
      }
    };
    walk(base);

    const packed = readJson(join(base, "package.json")) as Manifest;
    const manifestText = readFileSync(join(base, "package.json"), "utf8");
    if (/"(workspace|catalog):/.test(manifestText)) {
      problems.push("the packed package.json still has a workspace: or catalog: range");
    }
    if (packed.version !== workspace.manifest.version) problems.push("the packed version differs");

    if (![...files].some((file) => /^readme(\.md)?$/i.test(file))) problems.push("no README");
    if (!files.has("LICENSE")) problems.push("no LICENSE");

    for (const file of files) {
      for (const [pattern, what] of FORBIDDEN) {
        if (pattern.test(file)) problems.push(`ships ${what}: ${file}`);
      }
    }

    const targets = [
      ...leaves(packed.exports),
      ...leaves(packed.imports),
      ...Object.values(packed.bin ?? {}),
      ...[packed.main, packed.types].filter((one): one is string => typeof one === "string"),
    ];
    for (const target of new Set(targets)) {
      if (!matchesTarget(files, target))
        problems.push(`points at ${target}, which is not in the tarball`);
    }

    const roots = new Set(targets.map((target) => posix.normalize(target).split("/")[0]));
    if (roots.has("dist")) {
      const dist = [...files].filter((file) => file.startsWith("dist/"));
      if (!dist.some((file) => file.endsWith(".js"))) problems.push("dist has no .js");
      const typed = packed.types !== undefined || packed.exports !== undefined;
      if (typed && !dist.some((file) => file.endsWith(".d.ts"))) problems.push("dist has no .d.ts");
    }

    for (const file of files) {
      const full = join(base, file);
      if (file.endsWith(".node") || statSync(full).size > 4 * 1024 * 1024) continue;
      const text = readFileSync(full, "utf8");
      for (const [pattern, what] of SECRETS) {
        if (pattern.test(text)) problems.push(`${file} contains what looks like ${what}`);
      }
      if (!SOURCE.test(file) || !roots.has(file.split("/")[0])) continue;
      for (const match of stripComments(text).matchAll(RELATIVE)) {
        const specifier = match[1];
        if (!resolvesIn(files, file, specifier)) {
          problems.push(`${file} imports ${specifier}, which is not in the tarball`);
        }
      }
    }

    if (!isPlatformBinding(packed)) {
      const tarballBytes = await Bun.file(tarball).arrayBuffer();
      const { messages, pkg } = await publint({
        pack: { tarball: tarballBytes },
        level: "suggestion",
        strict: true,
      });
      for (const message of messages) {
        problems.push(
          `publint ${message.type}: ${formatMessage(message, pkg, { color: false }) ?? message.code}`,
        );
      }

      if (packed.exports !== undefined) problems.push(...typesProblems(tarball, packed));
    }
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
  return problems;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const requireBinaries = args.includes("--require-binaries");
  const only = new Set(args.filter((arg) => !arg.startsWith("--")));

  const all = workspaces();
  let failed = false;
  for (const workspace of all.filter((one) => one.manifest.private)) {
    const dependents = all.filter(
      (one) =>
        !one.manifest.private &&
        [
          one.manifest.dependencies,
          one.manifest.peerDependencies,
          one.manifest.optionalDependencies,
        ].some((group) => group?.[workspace.manifest.name] !== undefined),
    );
    if (dependents.length > 0) {
      failed = true;
      console.log(
        `FAIL  ${workspace.manifest.name} is private and published packages depend on it`,
      );
    }
  }

  const destination = mkdtempSync(join(tmpdir(), "barq-packs-"));
  try {
    for (const workspace of all) {
      const { name } = workspace.manifest;
      if (workspace.manifest.private) continue;
      if (only.size > 0 && !only.has(name)) continue;

      const problems = checkManifest(workspace, all);
      const tarball = pack(workspace, destination);
      if (tarball === null) {
        if (requireBinaries) problems.push(`no ${workspace.manifest.main} to pack`);
        else {
          console.log(`skip  ${name}: ${workspace.manifest.main} is not built on this machine`);
          continue;
        }
      } else {
        problems.push(...(await checkTarball(workspace, tarball)));
      }

      if (problems.length === 0) {
        console.log(`ok    ${name}`);
      } else {
        failed = true;
        console.log(`FAIL  ${name}`);
        for (const problem of problems)
          console.log(`      ${problem.split("\n").join("\n      ")}`);
      }
    }
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
  if (failed) process.exit(1);
}

if (import.meta.main) await main();
