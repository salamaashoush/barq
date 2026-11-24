import { variants } from "@barqjs/css";
import { createEffect, onCleanup, onSettled, untrack } from "@barqjs/core";
import { indentUnit } from "@codemirror/language";
import {
  MergeView,
  getOriginalDoc,
  originalDocChangeEffect,
  unifiedMergeView,
} from "@codemirror/merge";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { ChangeSet, Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers as lineNumberGutter } from "@codemirror/view";

import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { layout as flow } from "../style/index.ts";
import { codeTheme, diffChrome } from "./editor-theme.ts";
import { type CodeLanguage, loadLanguage, loadedLanguage } from "./languages.ts";
import {
  type ExtensionSource,
  changeReport,
  codeVars,
  extensionOf,
  fromCaller,
} from "./options.ts";
import { codeFrame, codeSurface } from "./style.ts";

export const codeDiffStyles = variants({
  slots: {
    root: arc({}),
    host: arc(flow.column, flow.growAuto, {
      minHeight: "var(--code-min-height, auto)",
      maxHeight: "var(--code-max-height, none)",
      overflow: "auto",
      "& .cm-mergeView": { flex: "1 1 auto" },
      "& .cm-mergeViewEditor + .cm-mergeViewEditor, & .cm-merge-revert + .cm-mergeViewEditor": {
        borderInlineStart: "1px solid var(--border)",
      },
    }),
  },
});

type Slots = ReturnType<typeof codeDiffStyles>;

export type CodeDiffLayout = "split" | "unified";

export interface CollapseUnchanged {
  /** Unchanged lines kept around each change. @default 3 */
  margin?: number;
  /** The fewest unchanged lines worth collapsing. @default 4 */
  minSize?: number;
}

export interface CodeDiffProps extends Customisable<Slots> {
  /** The text before. */
  original: string;
  /** The text after, which an editable diff lets the user change. */
  modified: string;
  /** The modified text after a change the user made, once per tick. */
  onChange?: (modified: string) => void;
  language?: CodeLanguage;
  /** Side by side, or one column with the removed lines above the added. @default "split" */
  layout?: CodeDiffLayout;
  /** @default true */
  readOnly?: boolean;
  /** Fold long unchanged stretches into a bar that opens them. `false` shows every line. @default true */
  collapseUnchanged?: boolean | CollapseUnchanged;
  /** @default true */
  lineNumbers?: boolean;
  /** @default false */
  wrap?: boolean;
  /** @default 2 */
  tabSize?: number;
  /** A CSS length, or pixels. */
  minHeight?: string | number;
  /** A CSS length, or pixels. Past it the diff scrolls. */
  maxHeight?: string | number;
  /** More of CodeMirror, on both sides. */
  extensions?: ExtensionSource;
  /** Names the original side. @default the provider's `original`, "Original" */
  originalLabel?: string;
  /** Names the modified side, or the one editor of a unified diff. @default the provider's `modified` */
  modifiedLabel?: string;
}

function collapseOf(
  value: boolean | CollapseUnchanged | undefined,
): { margin: number; minSize: number } | undefined {
  if (value === false) return undefined;
  const given = value === true || value === undefined ? {} : value;
  return { margin: given.margin ?? 3, minSize: given.minSize ?? 4 };
}

interface Built {
  /** What it was built for: the layout, the folding, and a unified diff's editability. */
  readonly shape: string;
  /** The editor of the modified text. */
  readonly modified: EditorView;
  /** The editor of the original text, in a split diff. */
  readonly original: EditorView | undefined;
  destroy(): void;
}

/**
 * Two versions of a text compared, on `@codemirror/merge`.
 *
 * ```tsx
 * <CodeDiff original={saved()} modified={draft()} language="json" />
 * <CodeDiff original={before} modified={after} layout="unified" readOnly={false} onChange={setAfter} />
 * ```
 *
 * Split puts the two side by side; unified shows one editor of the modified
 * text with each removed stretch drawn above what replaced it. Unchanged
 * stretches fold away. Editable, the modified side reports its changes as
 * `CodeEditor` does, and a new `original` or `modified` from the caller is
 * brought into the live diff. Changing the layout or the folding builds it
 * again.
 */
export function CodeDiff(props: CodeDiffProps) {
  const cls = (): Slots => parts(codeDiffStyles(), props.classes);
  const messages = useArcMessages();
  let element: HTMLDivElement | undefined;
  let built: Built | undefined;
  let disposed = false;
  const reporter = changeReport(
    untrack(() => props.modified),
    () => built?.modified.state.doc.toString(),
    (doc) => props.onChange?.(doc),
  );

  const languages = new Compartment();
  const editing = new Compartment();
  const gutter = new Compartment();
  const wrapping = new Compartment();
  const tabs = new Compartment();
  const extra = new Compartment();
  let language: CodeLanguage | undefined;
  let support: Extension = [];

  const readOnly = (): boolean => props.readOnly !== false;
  // What a diff is built for and cannot be reconfigured to: a unified diff's
  // accept and reject buttons come with its configuration.
  const shape = (): string => {
    const layout = props.layout ?? "split";
    const fold = JSON.stringify(collapseOf(props.collapseUnchanged) ?? null);
    return layout === "unified" ? `${layout} ${fold} ${String(readOnly())}` : `${layout} ${fold}`;
  };
  const tabExtension = (size: number): Extension => [
    EditorState.tabSize.of(size),
    indentUnit.of(" ".repeat(size)),
  ];

  const side = (label: string, editable: boolean): Extension => [
    codeTheme,
    diffChrome,
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    languages.of(support),
    editing.of(EditorState.readOnly.of(!editable)),
    gutter.of(untrack(() => props.lineNumbers !== false) ? lineNumberGutter() : []),
    wrapping.of(untrack(() => props.wrap === true) ? EditorView.lineWrapping : []),
    tabs.of(tabExtension(untrack(() => props.tabSize ?? 2))),
    extra.of(untrack(() => extensionOf(props.extensions))),
    EditorView.contentAttributes.of({ "aria-label": label }),
  ];

  const listener = reporter.listener;

  const build = (parent: HTMLDivElement): Built => {
    const original = untrack(() => props.original);
    reporter.known = untrack(() => props.modified);
    const layout = untrack(() => props.layout ?? "split");
    const collapse = untrack(() => collapseOf(props.collapseUnchanged));
    const originalLabel = untrack(() => props.originalLabel ?? messages().original);
    const modifiedLabel = untrack(() => props.modifiedLabel ?? messages().modified);
    const editable = untrack(() => !readOnly());
    const builtFor = untrack(shape);
    if (layout === "unified") {
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: reporter.known,
          extensions: [
            side(modifiedLabel, editable),
            unifiedMergeView({
              original,
              gutter: true,
              mergeControls: editable,
              ...(collapse === undefined ? {} : { collapseUnchanged: collapse }),
            }),
            listener,
          ],
        }),
      });
      return {
        shape: builtFor,
        modified: view,
        original: undefined,
        destroy: () => view.destroy(),
      };
    }
    const merge = new MergeView({
      parent,
      a: { doc: original, extensions: side(originalLabel, false) },
      b: { doc: reporter.known, extensions: [side(modifiedLabel, editable), listener] },
      gutter: true,
      ...(collapse === undefined ? {} : { collapseUnchanged: collapse }),
    });
    return {
      shape: builtFor,
      modified: merge.b,
      original: merge.a,
      destroy: () => merge.destroy(),
    };
  };

  const views = (): EditorView[] =>
    built === undefined
      ? []
      : built.original === undefined
        ? [built.modified]
        : [built.modified, built.original];

  const reconfigure = (compartment: Compartment, extension: Extension, sides = views()): void => {
    for (const view of sides) view.dispatch({ effects: compartment.reconfigure(extension) });
  };

  const mount = (): void => {
    const parent = element;
    if (parent === undefined || disposed) return;
    reporter.flush();
    built?.destroy();
    built = build(parent);
  };

  const applyLanguage = (next: CodeLanguage | undefined): void => {
    if (next === language) return;
    language = next;
    const ready = next === undefined ? [] : loadedLanguage(next);
    if (ready !== undefined) {
      support = ready;
      reconfigure(languages, support);
      return;
    }
    void loadLanguage(next as CodeLanguage).then((loaded) => {
      if (language !== next) return;
      support = loaded ?? [];
      reconfigure(languages, support);
    });
  };

  onSettled(() => {
    const wanted = untrack(() => props.language);
    language = wanted;
    const ready = wanted === undefined ? [] : loadedLanguage(wanted);
    if (ready !== undefined) {
      support = ready;
      mount();
      return;
    }
    void loadLanguage(wanted as CodeLanguage).then((loaded) => {
      if (language === wanted) support = loaded ?? [];
      mount();
    });
  });

  createEffect(
    () => props.language,
    (next) => {
      if (built !== undefined) applyLanguage(next);
    },
  );

  createEffect(shape, (next) => {
    if (built !== undefined && built.shape !== next) mount();
  });
  createEffect(readOnly, (on) => {
    if (built?.original !== undefined) {
      reconfigure(editing, EditorState.readOnly.of(on), [built.modified]);
    }
  });
  createEffect(
    () => props.lineNumbers !== false,
    (on) => reconfigure(gutter, on ? lineNumberGutter() : []),
  );
  createEffect(
    () => props.wrap === true,
    (on) => reconfigure(wrapping, on ? EditorView.lineWrapping : []),
  );
  createEffect(
    () => props.tabSize ?? 2,
    (size) => reconfigure(tabs, tabExtension(size)),
  );
  createEffect(
    () => extensionOf(props.extensions),
    (extension) => reconfigure(extra, extension),
  );

  createEffect(
    () => props.modified,
    (modified) => {
      if (built === undefined || modified === reporter.known) return;
      reporter.known = modified;
      const view = built.modified;
      if (modified === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: modified },
        annotations: fromCaller.of(true),
      });
    },
  );

  createEffect(
    () => props.original,
    (original) => {
      if (built === undefined) return;
      if (built.original !== undefined) {
        const view = built.original;
        if (original === view.state.doc.toString()) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: original } });
        return;
      }
      const view = built.modified;
      const current = getOriginalDoc(view.state);
      if (original === current.toString()) return;
      const changes = ChangeSet.of(
        { from: 0, to: current.length, insert: original },
        current.length,
      );
      view.dispatch({ effects: originalDocChangeEffect(view.state, changes) });
    },
  );

  onCleanup(() => {
    disposed = true;
    reporter.flush();
    built?.destroy();
    built = undefined;
  });

  return (
    <div
      class={arc(codeSurface, codeFrame, cls().root, props.class, props.className)}
      data-slot="code-diff"
      data-layout={props.layout ?? "split"}
      data-readonly={readOnly() ? "" : undefined}
      style={codeVars({
        minHeight: props.minHeight,
        maxHeight: props.maxHeight,
        tabSize: props.tabSize ?? 2,
      })}
    >
      <div
        ref={(node: HTMLDivElement) => {
          element = node;
        }}
        class={cls().host}
        data-slot="code-diff-host"
      />
    </div>
  );
}
