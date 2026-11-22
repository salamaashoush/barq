/**
 * Where a template's files come from.
 *
 * GitHub first: a template fixed there reaches the next project without a
 * release of this package. The copy this package ships is what is used
 * offline, when asked for, and whenever the network answer is not whole.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const TEMPLATE_ROOT = fileURLToPath(new URL("../templates", import.meta.url));

/** Replaces the default source: a base URL, or a directory on this machine. */
export const TEMPLATES_ENV = "BARQ_TEMPLATES";

/** The branch that is moved only to templates a release has been checked with. */
export const DEFAULT_REF = "templates";

const TIMEOUT_MS = 8000;

export interface Manifest {
  readonly version: 1;
  readonly templates: Readonly<Record<string, readonly string[]>>;
}

export interface Loaded {
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly origin: "github" | "bundled" | "directory";
  /** Why the bundled copy was used when the network was asked first. */
  readonly fellBack?: string;
}

export interface LoadOptions {
  readonly ref?: string;
  readonly offline?: boolean;
}

export function remoteBase(ref: string = DEFAULT_REF): string {
  return `https://raw.githubusercontent.com/salamaashoush/barq/${ref}/packages/create-barq/templates`;
}

function walk(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, prefix)).toSorted()) {
    if (entry === "node_modules" || entry === "dist") continue;
    const relative = prefix === "" ? entry : `${prefix}/${entry}`;
    if (statSync(join(root, relative)).isDirectory()) out.push(...walk(root, relative));
    else out.push(relative);
  }
  return out;
}

/** Every file of every template under `root`, which is what the manifest holds. */
export function manifestOf(root: string, names: readonly string[]): Manifest {
  const templates: Record<string, readonly string[]> = {};
  for (const name of names) templates[name] = walk(join(root, name));
  return { version: 1, templates };
}

function fromDirectory(root: string, name: string): ReadonlyMap<string, Uint8Array> {
  const directory = join(root, name);
  if (!existsSync(directory)) throw new Error(`no template named "${name}"`);
  const files = new Map<string, Uint8Array>();
  for (const file of walk(directory)) files.set(file, readFileSync(join(directory, file)));
  return files;
}

async function get(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fromUrl(base: string, name: string): Promise<ReadonlyMap<string, Uint8Array>> {
  const manifest = JSON.parse(
    new TextDecoder().decode(await get(`${base}/manifest.json`)),
  ) as Manifest;
  const listed = manifest.templates[name];
  if (listed === undefined) throw new Error(`the manifest at ${base} has no template "${name}"`);
  const bodies = await Promise.all(listed.map((file) => get(`${base}/${name}/${file}`)));
  return new Map(listed.map((file, at) => [file, bodies[at]]));
}

export async function load(name: string, options: LoadOptions = {}): Promise<Loaded> {
  const override = process.env[TEMPLATES_ENV];
  if (override !== undefined && override !== "" && !/^https?:\/\//.test(override)) {
    return { files: fromDirectory(override, name), origin: "directory" };
  }
  if (options.offline === true)
    return { files: fromDirectory(TEMPLATE_ROOT, name), origin: "bundled" };

  const base = override !== undefined && override !== "" ? override : remoteBase(options.ref);
  try {
    return { files: await fromUrl(base, name), origin: "github" };
  } catch (error) {
    // A ref the caller named is a request for that ref, not for whatever is at hand.
    if (options.ref !== undefined) throw error;
    return {
      files: fromDirectory(TEMPLATE_ROOT, name),
      origin: "bundled",
      fellBack: error instanceof Error ? error.message : String(error),
    };
  }
}
