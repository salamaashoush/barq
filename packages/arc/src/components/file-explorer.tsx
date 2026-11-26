import {
  type Child,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { dragAndDrop } from "@barqjs/aria/drag-and-drop";
import { ChevronsDownUp } from "@barqjs/lucide/icons/chevrons-down-up";
import { File } from "@barqjs/lucide/icons/file";
import { FilePlus } from "@barqjs/lucide/icons/file-plus";
import { Folder } from "@barqjs/lucide/icons/folder";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";
import { FolderPlus } from "@barqjs/lucide/icons/folder-plus";
import { clipboard } from "@barqjs/primitives/clipboard";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@barqjs/ui/context-menu";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, place, space, truncate, type } from "../style/index.ts";
import { confirm } from "./confirm.tsx";
import { IconButton } from "./icon-button.tsx";
import { Indicator } from "./indicator.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { type TreeNode, TreeView } from "./tree-view.tsx";
import {
  type VirtualFs,
  type VirtualFsEntry,
  type VirtualFsEntryKind,
  VirtualFsError,
  isValidName,
  joinPath,
  nameOf,
  parentOf,
} from "./virtual-fs.ts";

export const fileExplorerStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, { minHeight: "0px" }),
    header: arc(layout.row, gap[1], edge.bottom, place.paddedStrip),
    title: arc(type.label, fg.muted, layout.grow, truncate),
    actions: arc(layout.row, gap[0.5]),
    body: arc(layout.grow, layout.minZero, { overflow: "auto", padding: space.x1 }),
    tree: arc({}),
    dirty: arc({}),
    error: arc(type.meta, fg.danger, edge.top, { padding: space.x2 }),
    empty: arc(type.meta, fg.muted, { padding: space.x3 }),
  },
});

type Slots = ReturnType<typeof fileExplorerStyles>;

export interface FileExplorerProps extends Customisable<Slots> {
  /** The files: `virtualFs()`. */
  fs: VirtualFs;
  /** Names the tree. @default `title` when it is words, else "Files" */
  "aria-label"?: string;
  /** Over the tree, beside its actions. @default the tree's name */
  title?: Child;
  /** The file open beside it: chosen in the tree and its folders opened. */
  activePath?: string;
  /** A file was chosen: open it. */
  onOpen?: (path: string) => void;
  /** Files with changes not yet saved, marked with a dot. */
  dirtyPaths?: Iterable<string>;
  expandedPaths?: Iterable<string>;
  defaultExpandedPaths?: Iterable<string>;
  onExpandedChange?: (paths: string[]) => void;
  /** Browse only: nothing is made, renamed, moved or deleted. */
  readOnly?: boolean;
  /** Ask before deleting. @default true */
  confirmDelete?: boolean;
  /** Each entry's icon. @default a file, or a folder open or closed */
  icon?: (entry: VirtualFsEntry, expanded: boolean) => Child;
  /** Something was made, after it is in `fs`. */
  onCreate?: (path: string, kind: VirtualFsEntryKind) => void;
  /** Something was renamed or moved, after it moved in `fs`. A folder's files moved with it. */
  onMove?: (from: string, to: string) => void;
  /** Something was deleted, after it left `fs`. */
  onDelete?: (path: string, kind: VirtualFsEntryKind) => void;
  /** What an empty tree shows. @default "No files yet" */
  empty?: Child;
  id?: string;
}

const DRAFT = "\u0000new";

interface MenuAction {
  id: "new-file" | "new-folder" | "rename" | "delete" | "copy-path";
  label: string;
}

interface Draft {
  folder: string;
  kind: VirtualFsEntryKind;
}

function within(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

function moved(path: string, from: string, to: string): string {
  return within(path, from) ? to + path.slice(from.length) : path;
}

function withAncestors(paths: ReadonlySet<string>, path: string | undefined): Set<string> {
  const out = new Set(paths);
  if (path === undefined) return out;
  for (let folder = parentOf(path); folder !== ""; folder = parentOf(folder)) out.add(folder);
  return out;
}

function defaultIcon(entry: VirtualFsEntry, expanded: boolean): Child {
  if (entry.kind === "file") return <File />;
  return expanded ? <FolderOpen /> : <Folder />;
}

function draftFileIcon(): Child {
  return <File />;
}

function draftFolderIcon(): Child {
  return <Folder />;
}

function refusal(error: unknown, messages: ArcMessages): string {
  if (!(error instanceof VirtualFsError)) return String(error);
  if (error.code === "exists") return messages.nameTaken(nameOf(error.path));
  if (error.code === "into-itself") return messages.moveIntoItself;
  return messages.nameInvalid;
}

/**
 * The files of a workspace as a tree, over a `virtualFs()`: browsed and
 * opened, made, renamed in place, moved by dragging and deleted.
 *
 * ```tsx
 * const fs = virtualFs({ src: { "main.txt": "print 1" }, "README.md": "# Notes" });
 * <FileExplorer
 *   fs={fs}
 *   activePath={open()}
 *   onOpen={setOpen}
 *   dirtyPaths={unsaved()}
 *   onMove={(from, to) => retarget(from, to)}
 * />
 * ```
 *
 * On `TreeView`: one Tab stop, the arrows walk and open folders in the
 * reading direction, Enter or a press opens a file. New file and New folder
 * add a row in the chosen folder whose name is typed in place; F2 renames,
 * Delete (or ⌘⌫) deletes after asking, and a right-click, a held touch or
 * Shift+F10 opens the same actions for a row. Rows drag onto a folder to move
 * there, by pointer, touch or the keyboard's drag button. A name already in
 * the folder, or one with a slash, is refused with the reason, and a change
 * `fs` refuses is said under the tree. Every change is in `fs` before the
 * `onCreate`, `onMove` or `onDelete` that tells the app about it.
 */
export function FileExplorer(props: FileExplorerProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(fileExplorerStyles(), props.classes);
  }
  function label(): string {
    const title = props.title;
    return props["aria-label"] ?? (typeof title === "string" ? title : messages().files);
  }
  const [ownExpanded, setOwnExpanded] = createSignal<ReadonlySet<string>>(
    withAncestors(
      new Set(untrack(() => props.defaultExpandedPaths) ?? []),
      untrack(() => props.activePath),
    ),
    { ownedWrite: true },
  );
  function expanded(): ReadonlySet<string> {
    return props.expandedPaths === undefined ? ownExpanded() : new Set(props.expandedPaths);
  }
  function setExpanded(next: ReadonlySet<string>): void {
    setOwnExpanded(next);
    props.onExpandedChange?.([...next]);
  }
  const [chosen, setChosen] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  function selected(): string | undefined {
    return chosen() ?? props.activePath;
  }
  const [draft, setDraft] = createSignal<Draft | null>(null, { ownedWrite: true });
  const [renaming, setRenaming] = createSignal<string | null>(null, { ownedWrite: true });
  const [problem, setProblem] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const dirty = createMemo(() => new Set(props.dirtyPaths ?? []));

  function opened(): ReadonlySet<string> {
    return expanded();
  }

  if (!isServer) {
    // The folders opened to show the open file stay open once it moves on.
    createEffect(
      () => props.activePath,
      (active) => {
        if (active === undefined || untrack(() => props.expandedPaths) !== undefined) return;
        const held = untrack(ownExpanded);
        const next = withAncestors(held, active);
        if (next.size !== held.size) setOwnExpanded(next);
      },
    );
  }

  function unsaved(): Child {
    return <Indicator dot size="sm" class={cls().dirty} label={messages().unsavedChanges} />;
  }
  function node(entry: VirtualFsEntry, open: ReadonlySet<string>): TreeNode {
    const shut = !open.has(entry.path);
    function icon(): Child {
      return (props.icon ?? defaultIcon)(entry, !shut);
    }
    if (entry.kind === "file") {
      return {
        id: entry.path,
        label: entry.name,
        icon,
        end: dirty().has(entry.path) ? unsaved : undefined,
      };
    }
    return {
      id: entry.path,
      label: entry.name,
      icon,
      hasChildren: true,
      children: level(entry.path, open),
    };
  }

  function level(folder: string, open: ReadonlySet<string>): TreeNode[] {
    const rows = props.fs.list(folder).map((entry) => node(entry, open));
    const pending = draft();
    if (pending !== null && pending.folder === folder) {
      const icon = pending.kind === "folder" ? draftFolderIcon : draftFileIcon;
      const row: TreeNode = { id: DRAFT, label: "", icon, hasChildren: pending.kind === "folder" };
      const firstFile = rows.findIndex((one) => one.hasChildren !== true);
      rows.splice(pending.kind === "folder" || firstFile === -1 ? 0 : firstFile, 0, row);
    }
    return rows;
  }

  const items = createMemo(() => level("", opened()));

  function kindOf(path: string): VirtualFsEntryKind | undefined {
    return props.fs.entry(path)?.kind;
  }

  function targetFolder(path: string | undefined): string {
    if (path === undefined || path === DRAFT) return "";
    return kindOf(path) === "folder" ? path : parentOf(path);
  }

  function startCreate(kind: VirtualFsEntryKind, folder: string): void {
    if (props.readOnly === true) return;
    setProblem(undefined);
    if (folder !== "") setExpanded(new Set([...untrack(expanded), folder]));
    setDraft({ folder, kind });
    setRenaming(DRAFT);
  }

  function validate(name: string, id: string): string | undefined {
    if (!isValidName(name)) return messages().nameInvalid;
    const folder = id === DRAFT ? (untrack(draft)?.folder ?? "") : parentOf(id);
    const path = joinPath(folder, name);
    if (path !== id && props.fs.exists(path)) return messages().nameTaken(name);
    return undefined;
  }

  function rename(id: string, name: string): string | undefined {
    setProblem(undefined);
    try {
      if (id === DRAFT) {
        const pending = untrack(draft);
        if (pending === null) return undefined;
        const path = joinPath(pending.folder, name);
        if (pending.kind === "folder") props.fs.mkdir(path);
        else props.fs.write(path, "");
        setDraft(null);
        setChosen(path);
        props.onCreate?.(path, pending.kind);
        if (pending.kind === "file") props.onOpen?.(path);
        return path;
      }
      const to = props.fs.rename(id, name);
      retarget(id, to);
      return to;
    } catch (error) {
      setProblem(refusal(error, messages()));
      return undefined;
    }
  }

  function retarget(from: string, to: string): void {
    setExpanded(new Set([...untrack(expanded)].map((one) => moved(one, from, to))));
    const current = untrack(chosen);
    if (current !== undefined) setChosen(moved(current, from, to));
    props.onMove?.(from, to);
  }

  function renamingChanged(id: string | null): void {
    setRenaming(id);
    if (id === null) setDraft(null);
  }

  async function remove(path: string): Promise<void> {
    const entry = props.fs.entry(path);
    if (entry === undefined || props.readOnly === true) return;
    if (props.confirmDelete !== false) {
      const inside = entry.kind === "folder" ? countInside(path) : 0;
      const sure = await confirm({
        title: messages().deleteEntryHeading(entry.name),
        description:
          entry.kind === "folder"
            ? messages().deleteFolderDescription(inside)
            : messages().deleteFileDescription,
        tone: "danger",
        confirmLabel: messages().delete,
      });
      if (!sure) return;
    }
    setProblem(undefined);
    try {
      props.fs.remove(path);
    } catch (error) {
      setProblem(refusal(error, messages()));
      return;
    }
    const current = untrack(chosen);
    if (current !== undefined && within(current, path)) setChosen(undefined);
    setExpanded(new Set([...untrack(expanded)].filter((one) => !within(one, path))));
    props.onDelete?.(path, entry.kind);
  }

  function countInside(folder: string): number {
    let count = 0;
    for (const one of props.fs.list(folder)) {
      count += 1;
      if (one.kind === "folder") count += countInside(one.path);
    }
    return count;
  }

  function move(keys: Iterable<Key>, folder: string): void {
    setProblem(undefined);
    for (const key of keys) {
      const from = String(key);
      if (from === DRAFT || parentOf(from) === folder) continue;
      const to = joinPath(folder, nameOf(from));
      try {
        props.fs.move(from, to);
      } catch (error) {
        setProblem(refusal(error, messages()));
        continue;
      }
      retarget(from, to);
    }
  }

  const { dragAndDropHooks } = dragAndDrop<TreeNode>({
    isDisabled: () => props.readOnly === true || renaming() !== null,
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    shouldAcceptItemDrop: (target) => kindOf(String(target.key)) === "folder",
    onMove: (event) => {
      const key = String(event.target.key);
      move(event.keys, event.target.dropPosition === "on" ? key : parentOf(key));
    },
  });

  const [subject, setSubject] = createSignal<string | null>(null, { ownedWrite: true });
  function rowOf(target: EventTarget | null): string | null {
    const row = (target as Element | null)?.closest?.<HTMLElement>('[role="row"][data-key]');
    const key = row?.dataset["key"];
    return key === undefined || key === DRAFT ? null : key;
  }
  function aim(event: Event): void {
    setSubject(rowOf(event.target));
  }
  function aimFromKeys(event: KeyboardEvent): void {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) aim(event);
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (props.readOnly === true || untrack(renaming) !== null) return;
    const deleting = event.key === "Delete" || (event.key === "Backspace" && event.metaKey);
    if (!deleting) return;
    const path = rowOf(event.target);
    if (path === null) return;
    event.preventDefault();
    void remove(path);
  }

  function menu(): MenuAction[] {
    const path = subject();
    const writable = props.readOnly !== true;
    const kind = path === null ? "folder" : kindOf(path);
    const out: MenuAction[] = [];
    if (writable && kind === "folder") {
      out.push({ id: "new-file", label: messages().newFile });
      out.push({ id: "new-folder", label: messages().newFolder });
    }
    if (path !== null) {
      if (writable) {
        out.push({ id: "rename", label: messages().rename });
        out.push({ id: "delete", label: messages().delete });
      }
      out.push({ id: "copy-path", label: messages().copyPath });
    }
    return out;
  }
  const copier = clipboard();
  function act(action: MenuAction["id"]): void {
    const path = untrack(subject);
    if (action === "new-file") startCreate("file", path ?? "");
    else if (action === "new-folder") startCreate("folder", path ?? "");
    else if (path === null) return;
    else if (action === "rename") setRenaming(path);
    else if (action === "delete") void remove(path);
    else if (action === "copy-path") void copier.copy(path);
  }

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="file-explorer"
    >
      <div class={cls().header} data-slot="file-explorer-header">
        <span class={cls().title} data-slot="file-explorer-title">
          {props.title ?? label()}
        </span>
        <Show when={props.readOnly !== true}>
          <div class={cls().actions} data-slot="file-explorer-actions">
            <IconButton
              label={messages().newFile}
              size="sm"
              onPress={() => startCreate("file", targetFolder(untrack(selected)))}
            >
              <FilePlus />
            </IconButton>
            <IconButton
              label={messages().newFolder}
              size="sm"
              onPress={() => startCreate("folder", targetFolder(untrack(selected)))}
            >
              <FolderPlus />
            </IconButton>
            <IconButton
              label={messages().collapseFolders}
              size="sm"
              isDisabled={opened().size === 0}
              onPress={() => setExpanded(new Set())}
            >
              <ChevronsDownUp />
            </IconButton>
          </div>
        </Show>
      </div>
      <ContextMenu>
        <ContextMenuTrigger class={cls().body} data-slot="file-explorer-body">
          <div
            onContextMenuCapture={aim}
            onPointerDownCapture={aim}
            onKeyDownCapture={aimFromKeys}
            onKeyDown={onKeyDown}
          >
            <TreeView<TreeNode>
              class={cls().tree}
              aria-label={label()}
              items={items()}
              selectionMode="single"
              selectedKeys={selected() === undefined ? [] : [selected() as string]}
              onSelectionChange={(keys) => {
                const key = keys === "all" ? undefined : [...keys][0];
                if (key === undefined || key === DRAFT) return;
                const path = String(key);
                setChosen(path);
                if (kindOf(path) === "file") props.onOpen?.(path);
              }}
              expandedKeys={opened()}
              onExpandedChange={(keys) => setExpanded(new Set([...keys].map(String)))}
              dragAndDropHooks={props.readOnly === true ? undefined : dragAndDropHooks}
              renamingKey={renaming()}
              onRenamingKeyChange={renamingChanged}
              onRename={props.readOnly === true ? undefined : rename}
              validateLabel={validate}
              renameSelection={(name) => {
                const dot = name.lastIndexOf(".");
                return dot > 0 ? [0, dot] : [0, name.length];
              }}
              renameFieldLabel={(row) =>
                row.id === DRAFT
                  ? untrack(draft)?.kind === "folder"
                    ? messages().newFolderName
                    : messages().newFileName
                  : messages().renameItem(row.label)
              }
              empty={
                <div class={cls().empty} data-slot="file-explorer-empty">
                  {props.empty ?? messages().noFiles}
                </div>
              }
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent aria-label={messages().fileActions}>
          <For each={() => menu()}>
            {(action: MenuAction) => (
              <ContextMenuItem
                variant={action.id === "delete" ? "destructive" : "default"}
                onSelect={() => act(action.id)}
              >
                {action.label}
              </ContextMenuItem>
            )}
          </For>
        </ContextMenuContent>
      </ContextMenu>
      <Show when={problem() !== undefined}>
        <div class={cls().error} data-slot="file-explorer-error" role="alert">
          {problem()}
        </div>
      </Show>
    </div>
  );
}
