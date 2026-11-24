import {
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  getOwner,
  onCleanup,
  onSettled,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import { srOnly } from "@barqjs/ui/sr-only";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers as lineNumberGutter,
  placeholder as placeholderText,
  rectangularSelection,
} from "@codemirror/view";

import { arcLayer as arc } from "../layer.ts";
import { codeTheme } from "./editor-theme.ts";
import { type CodeLanguage, loadLanguage, loadedLanguage } from "./languages.ts";
import { type ExtensionSource, codeVars, extensionOf, fromCaller } from "./options.ts";
import { StaticCode } from "./static-code.tsx";
import { codeFrame, codeSurface } from "./style.ts";

const host = arc({
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minHeight: "0px",
});

export interface CodeEditorProps {
  /** The document, controlled: a new value replaces what the editor holds. */
  value?: string;
  /** The first document of an editor that keeps its own. */
  defaultValue?: string;
  /**
   * The document after a change the user made. Every change in one tick is
   * reported once, after it, with the latest document.
   */
  onChange?: (value: string) => void;
  /** A registered name (`"typescript"`, `"json"`, ...) or a `LanguageSupport`. Plain text when left out. */
  language?: CodeLanguage;
  readOnly?: boolean;
  /** Shown while the document is empty. */
  placeholder?: string;
  /** @default true */
  lineNumbers?: boolean;
  /** Wrap long lines instead of scrolling sideways. @default false */
  wrap?: boolean;
  /** A CSS length, or pixels. */
  minHeight?: string | number;
  /** A CSS length, or pixels. Past it the editor scrolls. */
  maxHeight?: string | number;
  /** Columns per tab and per indent. @default 2 */
  tabSize?: number;
  /**
   * More of CodeMirror: completion sources, linting, hover, keymaps. An
   * accessor is followed, and the editor reconfigures when what it returns
   * changes.
   */
  extensions?: ExtensionSource;
  /** Names the editor when nothing on the page labels it. */
  label?: string;
  /** The id of the element that labels the editor. */
  labelledBy?: string;
  /** A sentence about the editor, read after its name. */
  description?: string;
  /** Ids of more elements that describe the editor. */
  describedBy?: string;
  /** The editable element's id. */
  id?: string;
  invalid?: boolean;
  /** Called with the document on Mod-Enter. */
  onSubmit?: (value: string) => void;
  /**
   * The live `EditorView`, once the editor has taken over; what it returns
   * runs when the editor goes. It runs under the component's owner, so
   * effects made in it follow the component.
   */
  onView?: (view: EditorView) => void | (() => void);
  class?: string;
}

/**
 * A CodeMirror editor owned by a component.
 *
 * ```tsx
 * const [query, setQuery] = createSignal("select * from users");
 *
 * <CodeEditor label="Query" language="sql" value={query()} onChange={setQuery} />
 * ```
 *
 * Until it is mounted, and on a server, the code is a highlighted `<pre>` of
 * the editor's own metrics, which the editor replaces once its language has
 * loaded: a hydrated page shows the code from its first paint, and nothing
 * moves when it turns editable. Every option is a compartment, so changing
 * one reconfigures the live editor in place, and the colours are custom
 * properties, so a theme switch needs no reconfigure at all.
 */
export function CodeEditor(props: CodeEditorProps) {
  const owner = getOwner();
  const descriptionId = createUniqueId();
  const [mounted, setMounted] = createSignal(false, { ownedWrite: true });
  let element: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let disposed = false;
  let release: (() => void) | undefined;

  // The document as the caller last knew it: what it passed in, or what was
  // last reported to it. A value equal to this needs no write, and a change
  // that ends equal to it needs no report.
  let known = untrack(() => props.value ?? props.defaultValue ?? "");
  let reporting = false;

  const report = (): void => {
    reporting = false;
    if (view === undefined) return;
    const doc = view.state.doc.toString();
    if (doc === known) return;
    known = doc;
    props.onChange?.(doc);
  };

  const attributes = (): Record<string, string> => {
    const values: Record<string, string> = {};
    if (props.id !== undefined) values.id = props.id;
    if (props.label !== undefined) values["aria-label"] = props.label;
    if (props.labelledBy !== undefined) values["aria-labelledby"] = props.labelledBy;
    const described = [
      props.description === undefined ? undefined : descriptionId,
      props.describedBy,
    ].filter((one) => one !== undefined && one !== "");
    if (described.length > 0) values["aria-describedby"] = described.join(" ");
    if (props.invalid === true) values["aria-invalid"] = "true";
    return values;
  };

  const initials: (() => Extension)[] = [];

  /**
   * One option in a compartment of its own. `read` answers a value compared
   * by identity, so an effect that runs with what the editor was built from
   * dispatches nothing.
   */
  const option = <T,>(read: () => T, build: (value: T) => Extension): void => {
    const compartment = new Compartment();
    let applied: { value: T } | undefined;
    initials.push(() => {
      const value = untrack(read);
      applied = { value };
      return compartment.of(build(value));
    });
    createEffect(read, (value) => {
      if (view === undefined || (applied !== undefined && Object.is(applied.value, value))) return;
      applied = { value };
      view.dispatch({ effects: compartment.reconfigure(build(value)) });
    });
  };

  option(
    () => props.lineNumbers ?? true,
    (on) => (on ? [lineNumberGutter(), highlightActiveLineGutter()] : []),
  );
  option(
    () => props.readOnly === true,
    (readOnly) => EditorState.readOnly.of(readOnly),
  );
  option(
    () => props.wrap === true,
    (wrap) => (wrap ? EditorView.lineWrapping : []),
  );
  option(
    () => props.tabSize ?? 2,
    (size) => [EditorState.tabSize.of(size), indentUnit.of(" ".repeat(size))],
  );
  option(
    () => props.placeholder,
    (text) => (text === undefined || text === "" ? [] : placeholderText(text)),
  );
  option(
    () => JSON.stringify(attributes()),
    (json) => EditorView.contentAttributes.of(JSON.parse(json) as Record<string, string>),
  );
  option(
    () => extensionOf(props.extensions),
    (extension) => extension,
  );

  const languages = new Compartment();
  // The language the editor holds or is loading, so a load that lands after
  // the prop moved on is dropped.
  let language: CodeLanguage | undefined;

  const applyLanguage = (next: CodeLanguage | undefined): void => {
    if (view === undefined || next === language) return;
    language = next;
    if (next === undefined) {
      view.dispatch({ effects: languages.reconfigure([]) });
      return;
    }
    const ready = loadedLanguage(next);
    if (ready !== undefined) {
      view.dispatch({ effects: languages.reconfigure(ready) });
      return;
    }
    void loadLanguage(next).then((support) => {
      if (view !== undefined && language === next) {
        view.dispatch({ effects: languages.reconfigure(support ?? []) });
      }
    });
  };

  createEffect(
    () => props.language,
    (next) => applyLanguage(next),
  );

  createEffect(
    () => props.value,
    (value) => {
      if (value === undefined || view === undefined || value === known) return;
      known = value;
      if (value === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: fromCaller.of(true),
      });
    },
  );

  const create = (parent: HTMLDivElement, loaded: CodeLanguage | undefined, support: Extension) => {
    known = untrack(() => props.value) ?? known;
    language = loaded;
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: known,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          autocompletion(),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: (target) => {
                  const submit = props.onSubmit;
                  if (submit === undefined) return false;
                  submit(target.state.doc.toString());
                  return true;
                },
              },
            ]),
          ),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          codeTheme,
          languages.of(support),
          ...initials.map((initial) => initial()),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || reporting) return;
            if (update.transactions.every((tr) => tr.annotation(fromCaller) === true)) return;
            reporting = true;
            queueMicrotask(report);
          }),
        ],
      }),
    });
    setMounted(true);
    applyLanguage(untrack(() => props.language));
    const created = view;
    const cleanup = runWithOwner(owner, () => props.onView?.(created));
    if (typeof cleanup === "function") release = cleanup;
  };

  onSettled(() => {
    const parent = element;
    if (parent === undefined) return;
    const wanted = untrack(() => props.language);
    const ready = wanted === undefined ? undefined : loadedLanguage(wanted);
    if (wanted === undefined || ready !== undefined) {
      create(parent, wanted, ready ?? []);
      return;
    }
    void loadLanguage(wanted).then((support) => {
      if (!disposed) create(parent, wanted, support ?? []);
    });
  });

  onCleanup(() => {
    disposed = true;
    // A change still waiting for its report is the caller's, even now.
    if (reporting) report();
    release?.();
    view?.destroy();
    view = undefined;
  });

  return (
    <div
      class={[codeSurface, codeFrame, props.class]}
      data-slot="code-editor"
      data-readonly={props.readOnly === true ? "" : undefined}
      data-invalid={props.invalid === true ? "" : undefined}
      data-mounted={mounted() ? "" : undefined}
      style={codeVars({
        minHeight: props.minHeight,
        maxHeight: props.maxHeight,
        tabSize: props.tabSize ?? 2,
      })}
    >
      <Show when={!mounted()}>
        <StaticCode
          code={props.value ?? known}
          language={props.language}
          lineNumbers={props.lineNumbers ?? true}
          wrap={props.wrap === true}
          placeholder={props.placeholder}
        />
      </Show>
      <div
        ref={(node: HTMLDivElement) => {
          element = node;
        }}
        class={host}
        data-slot="code-editor-host"
      />
      <Show when={props.description !== undefined}>
        <span id={descriptionId} class={srOnly}>
          {props.description}
        </span>
      </Show>
    </div>
  );
}
