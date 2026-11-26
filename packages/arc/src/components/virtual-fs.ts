import { type Signal, createSignal } from "@barqjs/core";

/**
 * Files and folders as a plain object: a string is a file and its content, an
 * object is a folder. What `toJSON` gives and `virtualFs` takes, so a
 * workspace survives `JSON.stringify` and a link.
 */
export type VirtualFsTree = { [name: string]: string | VirtualFsTree };

export type VirtualFsEntryKind = "file" | "folder";

export interface VirtualFsEntry {
  /** From the root, separated by `/`, with no leading slash: `src/main.txt`. */
  path: string;
  /** The last segment of the path. */
  name: string;
  /** The folder holding it, `""` at the root. */
  parent: string;
  kind: VirtualFsEntryKind;
}

export type VirtualFsErrorCode =
  | "exists"
  | "missing"
  | "not-a-folder"
  | "not-a-file"
  | "invalid-name"
  | "into-itself";

/** Why a change was refused, as a `code` a caller can word for its reader. */
export class VirtualFsError extends Error {
  readonly code: VirtualFsErrorCode;
  readonly path: string;
  constructor(code: VirtualFsErrorCode, path: string) {
    super(`${code}: ${path === "" ? "/" : path}`);
    this.name = "VirtualFsError";
    this.code = code;
    this.path = path;
  }
}

/** One change, as `onChange` hears it. */
export interface VirtualFsChange {
  kind: "write" | "create" | "remove" | "move" | "load";
  path: string;
  /** Where a moved entry went. */
  to?: string;
}

export interface VirtualFs {
  /** A folder's entries, folders first, then by name with numbers in order. @default the root */
  list(folder?: string): VirtualFsEntry[];
  entry(path: string): VirtualFsEntry | undefined;
  exists(path: string): boolean;
  /** A file's content; `undefined` for a folder or nothing. */
  read(path: string): string | undefined;
  /** Every file's path, in the order `list` walks them. */
  files(): string[];
  /** Writes a file, making it and the folders above it when they are missing. */
  write(path: string, content: string): void;
  /** Makes a folder and the folders above it. */
  mkdir(path: string): void;
  /** Moves a file or a folder, with what is in it, to a new path. */
  move(from: string, to: string): void;
  /** `move` within the same folder. Returns the new path. */
  rename(path: string, name: string): string;
  /** Removes a file, or a folder with what is in it. */
  remove(path: string): void;
  /** Everything, as a plain object. */
  toJSON(): VirtualFsTree;
  /** Replaces everything with `tree`. */
  load(tree: VirtualFsTree): void;
  /** Hears every change after it is made. Returns the way to stop. */
  onChange(listener: (change: VirtualFsChange) => void): () => void;
}

interface FileNode {
  kind: "file";
  content: string;
  version: Signal<number>;
}

interface FolderNode {
  kind: "folder";
}

type FsNode = FileNode | FolderNode;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** The folder holding `path`, `""` at the root. */
export function parentOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

/** The last segment of `path`. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Segments joined with `/`, empty ones left out. */
export function joinPath(...segments: readonly string[]): string {
  return segments
    .flatMap((one) => one.split("/"))
    .filter((one) => one !== "")
    .join("/");
}

/**
 * Whether `name` can be one segment of a path: not empty, no `/`, not `.` or
 * `..`, and no control characters.
 */
export function isValidName(name: string): boolean {
  if (name.trim() === "" || name === "." || name === "..") return false;
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "/" || char === "\\" || code < 32 || code === 127) return false;
  }
  return true;
}

function normalise(path: string): string {
  const clean = joinPath(path);
  for (const segment of clean.split("/")) {
    if (clean !== "" && !isValidName(segment)) throw new VirtualFsError("invalid-name", path);
  }
  return clean;
}

function compareEntries(a: VirtualFsEntry, b: VirtualFsEntry): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/**
 * An in-memory store of files and folders, reactive: `list`, `read`, `files`
 * and `toJSON` read inside a component or a memo follow every change.
 *
 * ```ts
 * const fs = virtualFs({ src: { "main.txt": "print 1" }, "notes.md": "# Notes" });
 * fs.write("src/util.txt", "");
 * fs.rename("notes.md", "README.md");
 * share(JSON.stringify(fs.toJSON()));
 * ```
 *
 * Paths are `/`-separated from the root with no leading slash. A change that
 * cannot be made throws a `VirtualFsError` whose `code` says why: the target
 * `exists`, the source is `missing`, a folder was moved `into-itself`. Reads
 * answer at once, before any flush, so imperative code sees its own writes.
 */
export function virtualFs(tree?: VirtualFsTree): VirtualFs {
  const nodes = new Map<string, FsNode>();
  const [structure, setStructure] = createSignal(0, { ownedWrite: true });
  const listeners = new Set<(change: VirtualFsChange) => void>();

  function changed(change: VirtualFsChange, shape: boolean): void {
    if (shape) setStructure((count) => count + 1);
    for (const listener of listeners) listener(change);
  }

  function folderExists(path: string): boolean {
    return path === "" || nodes.get(path)?.kind === "folder";
  }

  function makeFolders(path: string): void {
    if (path === "") return;
    const node = nodes.get(path);
    if (node?.kind === "folder") return;
    if (node !== undefined) throw new VirtualFsError("not-a-folder", path);
    makeFolders(parentOf(path));
    nodes.set(path, { kind: "folder" });
  }

  function entryOf(path: string, node: FsNode): VirtualFsEntry {
    return { path, name: nameOf(path), parent: parentOf(path), kind: node.kind };
  }

  function childrenOf(folder: string): VirtualFsEntry[] {
    const out: VirtualFsEntry[] = [];
    for (const [path, node] of nodes) {
      if (parentOf(path) === folder) out.push(entryOf(path, node));
    }
    return out.toSorted(compareEntries);
  }

  function walk(folder: string, into: (entry: VirtualFsEntry) => void): void {
    for (const one of childrenOf(folder)) {
      into(one);
      if (one.kind === "folder") walk(one.path, into);
    }
  }

  function addTree(into: Map<string, FsNode>, at: string, value: VirtualFsTree): void {
    for (const [name, child] of Object.entries(value)) {
      if (!isValidName(name)) throw new VirtualFsError("invalid-name", joinPath(at, name));
      const path = joinPath(at, name);
      if (typeof child === "string") into.set(path, newFile(child));
      else {
        into.set(path, { kind: "folder" });
        addTree(into, path, child);
      }
    }
  }

  function newFile(content: string): FileNode {
    return { kind: "file", content, version: createSignal(0, { ownedWrite: true }) };
  }

  if (tree !== undefined) addTree(nodes, "", tree);

  const fs: VirtualFs = {
    list(folder = "") {
      structure();
      const at = normalise(folder);
      if (!folderExists(at)) return [];
      return childrenOf(at);
    },
    entry(path) {
      structure();
      const at = normalise(path);
      const node = nodes.get(at);
      return node === undefined ? undefined : entryOf(at, node);
    },
    exists(path) {
      structure();
      const at = normalise(path);
      return at === "" || nodes.has(at);
    },
    read(path) {
      structure();
      const node = nodes.get(normalise(path));
      if (node?.kind !== "file") return undefined;
      node.version[0]();
      return node.content;
    },
    files() {
      structure();
      const out: string[] = [];
      walk("", (one) => {
        if (one.kind === "file") out.push(one.path);
      });
      return out;
    },
    write(path, content) {
      const at = normalise(path);
      if (at === "") throw new VirtualFsError("not-a-file", path);
      const node = nodes.get(at);
      if (node?.kind === "folder") throw new VirtualFsError("not-a-file", at);
      if (node !== undefined) {
        if (node.content === content) return;
        node.content = content;
        node.version[1]((count) => count + 1);
        changed({ kind: "write", path: at }, false);
        return;
      }
      makeFolders(parentOf(at));
      nodes.set(at, newFile(content));
      changed({ kind: "create", path: at }, true);
    },
    mkdir(path) {
      const at = normalise(path);
      if (folderExists(at)) return;
      makeFolders(at);
      changed({ kind: "create", path: at }, true);
    },
    move(from, to) {
      const source = normalise(from);
      const target = normalise(to);
      const node = nodes.get(source);
      if (node === undefined) throw new VirtualFsError("missing", source);
      if (target === source) return;
      if (target === "") throw new VirtualFsError("exists", target);
      if (node.kind === "folder" && target.startsWith(`${source}/`)) {
        throw new VirtualFsError("into-itself", target);
      }
      if (nodes.has(target)) throw new VirtualFsError("exists", target);
      if (!folderExists(parentOf(target))) {
        if (nodes.has(parentOf(target))) throw new VirtualFsError("not-a-folder", parentOf(target));
        makeFolders(parentOf(target));
      }
      const moving = [...nodes].filter(
        ([path]) => path === source || path.startsWith(`${source}/`),
      );
      for (const [path] of moving) nodes.delete(path);
      for (const [path, one] of moving) nodes.set(target + path.slice(source.length), one);
      changed({ kind: "move", path: source, to: target }, true);
    },
    rename(path, name) {
      const source = normalise(path);
      if (!isValidName(name))
        throw new VirtualFsError("invalid-name", joinPath(parentOf(source), name));
      const target = joinPath(parentOf(source), name);
      fs.move(source, target);
      return target;
    },
    remove(path) {
      const at = normalise(path);
      if (!nodes.has(at)) throw new VirtualFsError("missing", at);
      for (const key of nodes.keys()) {
        if (key === at || key.startsWith(`${at}/`)) nodes.delete(key);
      }
      changed({ kind: "remove", path: at }, true);
    },
    toJSON() {
      structure();
      function build(folder: string): VirtualFsTree {
        const out: VirtualFsTree = {};
        for (const one of childrenOf(folder)) {
          const node = nodes.get(one.path);
          if (node?.kind === "file") {
            node.version[0]();
            out[one.name] = node.content;
          } else out[one.name] = build(one.path);
        }
        return out;
      }
      return build("");
    },
    load(next) {
      const fresh = new Map<string, FsNode>();
      addTree(fresh, "", next);
      nodes.clear();
      for (const [path, node] of fresh) nodes.set(path, node);
      changed({ kind: "load", path: "" }, true);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return fs;
}
