import { For, Show, createEffect, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLexicalEditor } from "@barqjs/lexical";
import { ListTree } from "@barqjs/lucide/icons/list-tree";
import { Maximize2 } from "@barqjs/lucide/icons/maximize-2";
import { Minimize2 } from "@barqjs/lucide/icons/minimize-2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Button } from "@barqjs/ui/button";
import { $isHeadingNode } from "@lexical/rich-text";
import { $dfs } from "@lexical/utils";
import {
  $getNodeByKey,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  type LexicalCommand,
  type NodeKey,
  createCommand,
  mergeRegister,
} from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { fg, gap, layout, truncate, type } from "../style/index.ts";
import { shortcutLabel } from "./commands.ts";
import { defineEditorExtension } from "./extension.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

/** Words a minute a reader gets through, for the reading time. */
export const READING_WORDS_PER_MINUTE = 200;

/** Turns focus mode on or off: Mod+Shift+\, the status bar's button. */
export const TOGGLE_FOCUS_MODE_COMMAND: LexicalCommand<void> = createCommand("TOGGLE_FOCUS_MODE");

export const documentStatusStyles = variants({
  slots: {
    root: arc(layout.row, gap[2], layout.grow, layout.minZero, type.numeric),
    tools: arc(layout.row, gap[0.5], layout.pushEnd),
    outline: arc({ width: "min(18rem, calc(100vw - 1rem))", maxHeight: "60dvh" }),
    entry: arc(truncate, { unicodeBidi: "plaintext" }),
    level2: arc({ paddingInlineStart: "1.25rem" }),
    level3: arc(fg.muted, { paddingInlineStart: "2rem" }),
    level1: arc(type.medium),
  },
});

export interface OutlineEntry {
  key: NodeKey;
  level: 1 | 2 | 3;
  text: string;
}

/** The document's headings in order, wherever they stand, a callout's and a column's too; empty ones left out. */
export function $outline(): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (const { node } of $dfs($getRoot())) {
    if (!$isHeadingNode(node)) continue;
    const text = node.getTextContent().trim();
    if (text === "") continue;
    const tag = node.getTag();
    entries.push({ key: node.getKey(), level: tag === "h1" ? 1 : tag === "h2" ? 2 : 3, text });
  }
  return entries;
}

/** How many words a text holds, and the minutes it takes to read. */
export function readingStats(text: string): { words: number; minutes: number } {
  const words = text.match(/\S+/gu)?.length ?? 0;
  return { words, minutes: words === 0 ? 0 : Math.ceil(words / READING_WORDS_PER_MINUTE) };
}

/**
 * What a writer glances at under a long document: how many words it holds
 * and how long it takes to read, an outline of its headings to jump to, and
 * focus mode, which sets the writing alone on the screen until Escape or
 * Mod+Shift+\ ends it.
 */
export function DocumentStatus() {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const cls = documentStatusStyles();
  const read = () => editor.getEditorState().read(() => readingStats($getRoot().getTextContent()));
  const [stats, setStats] = editorSignal(read());
  const [entries, setEntries] = editorSignal<OutlineEntry[]>([]);
  const [focused, setFocused] = editorSignal(false);
  const frame = (): HTMLElement | null =>
    editor.getRootElement()?.closest<HTMLElement>('[data-slot="rich-text-editor"]') ?? null;

  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        const next = read();
        const now = stats();
        if (next.words !== now.words || next.minutes !== now.minutes) setStats(next);
      }),
      editor.registerCommand(
        TOGGLE_FOCUS_MODE_COMMAND,
        () => {
          setFocused(!focused());
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Escape leaves focus mode once nothing else, an open menu, took it.
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!focused()) return false;
          setFocused(false);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ),
  );

  createEffect(focused, (on) => {
    const element = frame();
    if (element === null || !on) return () => undefined;
    const body = element.ownerDocument.body;
    element.dataset.focusMode = "";
    const before = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = before;
      delete element.dataset.focusMode;
    };
  });
  onCleanup(() => {
    const element = frame();
    if (element !== null) delete element.dataset.focusMode;
  });

  const go = (key: NodeKey): void => {
    editor.getRootElement()?.focus({ preventScroll: true });
    editor.update(() => $getNodeByKey(key)?.selectEnd(), { discrete: true });
    editor.getElementByKey(key)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  return (
    <div class={cls.root} data-slot="document-status">
      <span data-slot="document-status-words">{messages().wordCount(stats().words)}</span>
      <Show when={stats().minutes > 0}>
        <span aria-hidden="true">·</span>
        <span data-slot="document-status-time">{messages().readingTime(stats().minutes)}</span>
      </Show>
      <span class={cls.tools}>
        <DropdownMenu
          onOpenChange={(open: boolean) => {
            if (open) setEntries(editor.getEditorState().read($outline));
          }}
        >
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon-xs" aria-label={messages().outline}>
              <ListTree aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class={cls.outline} aria-label={messages().outline} align="end">
            <DropdownMenuLabel>{messages().outline}</DropdownMenuLabel>
            <Show
              when={entries().length > 0}
              fallback={<DropdownMenuItem isDisabled>{messages().outlineEmpty}</DropdownMenuItem>}
            >
              <For each={entries()}>
                {(entry: OutlineEntry) => (
                  <DropdownMenuItem
                    class={
                      entry.level === 1 ? cls.level1 : entry.level === 2 ? cls.level2 : cls.level3
                    }
                    onSelect={() => go(entry.key)}
                  >
                    <span class={cls.entry} dir="auto">
                      {entry.text}
                    </span>
                  </DropdownMenuItem>
                )}
              </For>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          label={focused() ? messages().leaveFocusMode : messages().focusMode}
          shortcut={shortcutLabel("Mod+Shift+\\")}
          size="xs"
          isPressed={focused()}
          onPress={() => setFocused(!focused())}
        >
          {focused() ? <Minimize2 /> : <Maximize2 />}
        </IconButton>
      </span>
    </div>
  );
}

/**
 * The document's status under it: words, reading time, an outline to jump
 * between headings, and focus mode. See `DocumentStatus`.
 */
export const documentStatusExtension = defineEditorExtension({
  name: "arc/document-status",
  keys: [
    {
      keys: "Mod+Shift+\\",
      run: (editor) => editor.dispatchCommand(TOGGLE_FOCUS_MODE_COMMAND, undefined),
    },
  ],
  footer: () => <DocumentStatus />,
});
