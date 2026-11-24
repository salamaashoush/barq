import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { globalCss, variants } from "@barqjs/css";
import { useLexicalEditable, useLexicalEditor } from "@barqjs/lexical";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronUp } from "@barqjs/lucide/icons/chevron-up";
import { Search } from "@barqjs/lucide/icons/search";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { Input } from "@barqjs/ui/input";
import { Label } from "@barqjs/ui/label";
import { Portal } from "@barqjs/web";
import {
  $addUpdateTag,
  COMMAND_PRIORITY_LOW,
  type LexicalCommand,
  type LexicalEditor,
  SKIP_DOM_SELECTION_TAG,
  createCommand,
} from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, place, space, surface, type, zIndex } from "../style/index.ts";
import { defineEditorExtension } from "./extension.ts";
import { type Found, $findInDocument, $replaceFound, $selectFound } from "./find.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

/** Opens the editor's find and replace panel: Mod+F, the toolbar's Find and replace. */
export const OPEN_FIND_COMMAND: LexicalCommand<void> = createCommand("OPEN_FIND");

// The matches are drawn over the text by the browser, without touching it.
globalCss`
  ::highlight(arc-find) {
    background-color: color-mix(in oklab, var(--warning) 30%, transparent);
  }
  ::highlight(arc-find-current) {
    background-color: color-mix(in oklab, var(--warning) 70%, transparent);
  }
`;

export const findPanelStyles = variants({
  slots: {
    // Across the editor's top, held to its end by the free margin at its start.
    panel: arc(surface.elevated, layout.column, gap[3], place.padded, place.across, {
      insetBlockStart: space.x2,
      marginInline: `auto ${space.x2}`,
      zIndex: zIndex.popover,
      width: "min(22rem, calc(100% - 1rem))",
    }),
    header: arc(layout.row, layout.between, gap[2], type.label),
    row: arc(layout.row, gap[1]),
    options: arc(layout.row, layout.wrap, gap[3], type.caption),
    option: arc(layout.row, gap[1.5]),
    count: arc(type.caption, fg.muted, layout.pushEnd),
    replace: arc(layout.column, gap[2], edge.top, { paddingBlockStart: space.x3 }),
    actions: arc(layout.row, layout.end, gap[2]),
  },
});

type Slots = ReturnType<typeof findPanelStyles>;

const highlights = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;

/** A match as a range of the page's own text, for the browser to highlight. */
function rangeOf(editor: LexicalEditor, match: Found): Range | null {
  const start = editor.getElementByKey(match.anchor.key)?.firstChild;
  const end = editor.getElementByKey(match.focus.key)?.firstChild;
  if (start === null || start === undefined || end === null || end === undefined) return null;
  const range = document.createRange();
  try {
    range.setStart(start, match.anchor.offset);
    range.setEnd(end, match.focus.offset);
  } catch {
    // The text changed under the match; the next search draws it again.
    return null;
  }
  return range;
}

export interface FindPanelProps extends Customisable<Slots> {}

/**
 * Finds words in the document and replaces them: the matches highlighted in
 * place without touching the text, the one in hand scrolled into view and
 * counted, case and whole words on request, Arabic found with or without its
 * vowel marks. Enter goes to the next match and Shift+Enter back; Escape
 * closes the panel and selects the match in hand. Replacing keeps the caret
 * in the panel; a read-only document offers finding alone.
 */
export function FindPanel(props: FindPanelProps) {
  const editor = useLexicalEditor();
  const editable = useLexicalEditable();
  const messages = useArcMessages();
  const cls = (): Slots => parts(findPanelStyles(), props.classes);
  const ids = { find: createUniqueId(), replace: createUniqueId(), heading: createUniqueId() };
  const [open, setOpen] = editorSignal(false);
  const [host, setHost] = editorSignal<HTMLElement | null>(null);
  const [query, setQuery] = createSignal("", { ownedWrite: true });
  const [replacement, setReplacement] = createSignal("", { ownedWrite: true });
  const [matchCase, setMatchCase] = createSignal(false, { ownedWrite: true });
  const [wholeWords, setWholeWords] = createSignal(false, { ownedWrite: true });
  const [matches, setMatches] = editorSignal<Found[]>([]);
  const [current, setCurrent] = createSignal(0, { ownedWrite: true });
  let input: HTMLInputElement | undefined;
  const at = createMemo(() =>
    matches().length > 0 ? Math.min(current(), matches().length - 1) : -1,
  );

  const search = (): void => {
    const text = untrack(query);
    const options = { matchCase: untrack(matchCase), wholeWords: untrack(wholeWords) };
    setMatches(editor.getEditorState().read(() => $findInDocument(text, options)));
  };

  useRegistration(() =>
    editor.registerCommand(
      OPEN_FIND_COMMAND,
      () => {
        // The editor's frame, found as it opens: the root may not have been in it when this mounted.
        setHost(
          editor.getRootElement()?.closest<HTMLElement>('[data-slot="rich-text-editor"]') ?? null,
        );
        setOpen(true);
        search();
        queueMicrotask(() => {
          input?.focus();
          input?.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  useRegistration(() =>
    editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (untrack(open) && (dirtyElements.size > 0 || dirtyLeaves.size > 0)) search();
    }),
  );
  createEffect(
    () => [query(), matchCase(), wholeWords(), open()] as const,
    ([, , , isOpen]) => {
      if (isOpen) search();
    },
  );

  createEffect(
    () => [open(), matches(), at()] as const,
    ([isOpen, found, index]) => {
      const registry = highlights();
      if (!isOpen || registry === null) return;
      const ranges = found.map((match) => rangeOf(editor, match));
      registry.set(
        "arc-find",
        new Highlight(
          ...ranges.filter((range, which): range is Range => range !== null && which !== index),
        ),
      );
      const here = ranges[index];
      if (here === null || here === undefined) registry.delete("arc-find-current");
      else {
        registry.set("arc-find-current", new Highlight(here));
        here.startContainer.parentElement?.scrollIntoView?.({ block: "nearest" });
      }
    },
  );
  onCleanup(() => {
    highlights()?.delete("arc-find");
    highlights()?.delete("arc-find-current");
  });

  const step = (by: number): void => {
    const count = matches().length;
    if (count > 0) setCurrent((at() + by + count) % count);
  };
  const replaceOne = (): void => {
    const match = matches()[at()];
    if (match === undefined) return;
    const words = replacement();
    editor.update(() => {
      // The words change where they are; the caret stays in this panel.
      $addUpdateTag(SKIP_DOM_SELECTION_TAG);
      $replaceFound([match], words);
    });
  };
  const replaceAll = (): void => {
    const found = matches();
    const words = replacement();
    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG);
      $replaceFound(found, words);
    });
  };
  const close = (): void => {
    const match = matches()[at()];
    setOpen(false);
    highlights()?.delete("arc-find");
    highlights()?.delete("arc-find-current");
    editor.focus();
    if (match !== undefined) editor.update(() => void $selectFound(match));
  };
  const status = (): string =>
    query() === ""
      ? ""
      : matches().length > 0
        ? messages().matchCount(at() + 1, matches().length)
        : messages().noMatches;

  return (
    <Show when={open() ? host() : null}>
      {(mount: () => HTMLElement) => (
        <Portal mount={mount()}>
          <div
            class={arc(cls().panel, props.class, props.className)}
            role="search"
            aria-labelledby={ids.heading}
            data-slot="find-panel"
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              close();
            }}
          >
            <div class={cls().header}>
              <span id={ids.heading}>{messages().findAndReplace}</span>
              <IconButton label={messages().close} size="xs" onPress={close}>
                <X />
              </IconButton>
            </div>
            <div class={cls().row}>
              <Input
                ref={(element: HTMLInputElement) => {
                  input = element;
                }}
                id={ids.find}
                type="search"
                dir="auto"
                class={layout.grow}
                value={query()}
                aria-label={messages().findText}
                placeholder={messages().findText}
                onInput={(event: Event) => {
                  setQuery((event.currentTarget as HTMLInputElement).value);
                  setCurrent(0);
                }}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  step(event.shiftKey ? -1 : 1);
                }}
              />
              <IconButton
                label={messages().previousMatch}
                size="sm"
                isDisabled={matches().length === 0}
                onPress={() => step(-1)}
              >
                <ChevronUp />
              </IconButton>
              <IconButton
                label={messages().nextMatch}
                size="sm"
                isDisabled={matches().length === 0}
                onPress={() => step(1)}
              >
                <ChevronDown />
              </IconButton>
            </div>
            <div class={cls().options}>
              <span class={cls().option}>
                <Checkbox
                  id={`${ids.find}-case`}
                  checked={matchCase()}
                  onCheckedChange={setMatchCase}
                />
                <Label for={`${ids.find}-case`}>{messages().matchCase}</Label>
              </span>
              <span class={cls().option}>
                <Checkbox
                  id={`${ids.find}-whole`}
                  checked={wholeWords()}
                  onCheckedChange={setWholeWords}
                />
                <Label for={`${ids.find}-whole`}>{messages().wholeWords}</Label>
              </span>
              <output class={cls().count} aria-live="polite" data-slot="find-count">
                {status()}
              </output>
            </div>
            <Show when={editable()}>
              <div class={cls().replace}>
                <Input
                  id={ids.replace}
                  dir="auto"
                  value={replacement()}
                  aria-label={messages().replaceWith}
                  placeholder={messages().replaceWith}
                  onInput={(event: Event) =>
                    setReplacement((event.currentTarget as HTMLInputElement).value)
                  }
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    replaceOne();
                  }}
                />
                <div class={cls().actions}>
                  <Button variant="ghost" size="sm" isDisabled={at() < 0} onPress={replaceOne}>
                    {messages().replaceOne}
                  </Button>
                  <Button size="sm" isDisabled={at() < 0} onPress={replaceAll}>
                    {messages().replaceAll}
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </Portal>
      )}
    </Show>
  );
}

/**
 * Find and replace, from Mod+F or the toolbar's button, in a panel at the
 * editor's top corner: see `FindPanel`.
 */
export const findExtension = defineEditorExtension({
  name: "arc/find",
  keys: [
    {
      keys: "Mod+f",
      run: (editor) => editor.dispatchCommand(OPEN_FIND_COMMAND, undefined),
    },
  ],
  toolbar: [
    {
      id: "find",
      label: (messages) => messages.findAndReplace,
      icon: () => <Search />,
      shortcut: "Mod+F",
      priority: 1,
      run: (editor) => editor.dispatchCommand(OPEN_FIND_COMMAND, undefined),
    },
  ],
  plugins: [() => <FindPanel />],
});
