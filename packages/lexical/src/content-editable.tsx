import { Show, createEffect, createSignal, isBlock, omit, untrack } from "@barqjs/core";
import { type JSX, isHydrating, isServer, onHydrationEnd } from "@barqjs/web";
import type { LexicalEditor } from "lexical";

import { useLexicalEditor } from "./context.ts";
import { useLexicalCanShowPlaceholder, watchEditable } from "./hooks.ts";

type DivAttributes = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "children" | "contentEditable" | "contenteditable" | "placeholder" | "ref"
> & {
  /** Called with the element once it is built; what it returns runs when it goes. */
  ref?: (element: HTMLDivElement) => void | (() => void);
};

export interface ContentEditableElementProps extends DivAttributes {
  editor: LexicalEditor;
  /**
   * The document drawn without an editor, which a server writes inside the
   * root and a hydrating page shows until the editor takes the root over, so
   * the page holds still as it turns editable. A browser rendering from
   * scratch never draws it. Read once.
   */
  serverContent?: JSX.Element;
}

/** Shown over an empty editor: JSX, or a function of whether the editor is editable. */
export type PlaceholderContent = JSX.Element | ((isEditable: boolean) => JSX.Element);

export interface ContentEditableProps extends DivAttributes {
  placeholder?: PlaceholderContent | null;
  "aria-placeholder"?: string;
  /** See {@link ContentEditableElementProps.serverContent}. */
  serverContent?: JSX.Element;
}

const OWNED = [
  "editor",
  "serverContent",
  "style",
  "ref",
  "role",
  "spellcheck",
  "tabIndex",
  "aria-activedescendant",
  "aria-autocomplete",
  "aria-controls",
  "aria-expanded",
  "aria-multiline",
  "aria-owns",
  "aria-placeholder",
  "aria-readonly",
  "aria-required",
] as const;

function hasName(values: readonly unknown[]): boolean {
  return values.some((value) => typeof value === "string" && value.trim() !== "");
}

/**
 * The editor's editable `<div>`, bound to `editor` as its root element. It
 * mirrors whether the editor is editable onto `contenteditable` and the ARIA
 * attributes, and is a `textbox` while it is editable or has a name.
 *
 * On the server it is the same `<div>`, empty or holding `serverContent`, and
 * with the white space Lexical gives a root, so text wraps there as it will
 * once bound. The editor fills it once it is hydrated and bound; with
 * `serverContent`, once hydration has ended and that content has gone.
 */
export function ContentEditableElement(props: ContentEditableElementProps): JSX.Element {
  const editor = props.editor;
  const isEditable = watchEditable(editor);

  function role(): string | undefined {
    const given = props.role as string | undefined;
    if (given !== undefined) return given;
    return isEditable() || hasName([props["aria-label"], props["aria-labelledby"], props.title])
      ? "textbox"
      : undefined;
  }
  // Widget attributes mean nothing on an element with no role.
  function widget(): boolean {
    return role() !== undefined;
  }

  // Only a server and a page claiming its markup draw the static document.
  const given = untrack(() => props.serverContent !== undefined);
  const claiming = given && !isServer && isHydrating();
  const [held, setHeld] = createSignal(given && (isServer || claiming));
  let root: HTMLDivElement | null = null;

  // A root element needs a window. One cloned from a template belongs to the
  // template's document, which has none, until it is inserted into the page;
  // a frame being torn down has none either.
  function attach(element: HTMLDivElement): void {
    if (element.ownerDocument.defaultView === null) return;
    // Lexical runs its root and update listeners as the root is set, from
    // inside whatever set it; what they read is theirs, not this effect's.
    if (editor.getRootElement() !== element) untrack(() => editor.setRootElement(element));
  }
  function bind(element: HTMLDivElement): () => void {
    root = element;
    if (!untrack(held)) attach(element);
    return () => {
      root = null;
      editor.setRootElement(null);
    };
  }
  if (claiming) onHydrationEnd(() => setHeld(false));
  // Once the element is in the page, and with `serverContent` once that has
  // been taken out: Lexical empties the root it is given, and those nodes are
  // barq's to remove.
  createEffect(held, (holding) => {
    if (!holding && root !== null) attach(root);
  });

  return (
    <div
      {...omit(props, ...OWNED)}
      ref={props.ref === undefined ? bind : [props.ref, bind]}
      style={rootStyle(props.style)}
      contentEditable={isEditable()}
      role={role()}
      spellcheck={props.spellcheck ?? true}
      tabIndex={props.tabIndex ?? (isEditable() ? undefined : -1)}
      aria-activedescendant={widget() && isEditable() ? props["aria-activedescendant"] : undefined}
      aria-autocomplete={
        widget() ? (isEditable() ? props["aria-autocomplete"] : "none") : undefined
      }
      aria-controls={isEditable() ? props["aria-controls"] : undefined}
      aria-expanded={
        widget() && role() === "combobox" ? (props["aria-expanded"] ?? false) : undefined
      }
      aria-multiline={widget() ? props["aria-multiline"] : undefined}
      aria-owns={isEditable() ? props["aria-owns"] : undefined}
      aria-placeholder={widget() ? (props as ContentEditableProps)["aria-placeholder"] : undefined}
      aria-readonly={widget() && !isEditable() ? true : undefined}
      aria-required={widget() ? props["aria-required"] : undefined}
    >
      {held() ? props.serverContent : undefined}
    </div>
  );
}

type Style = Exclude<DivAttributes["style"], undefined | ((...args: never[]) => unknown)>;
type StyleObject = Exclude<Style, string>;

/** What Lexical sets on a root as it binds, written from the start so nothing reflows then. */
const ROOT_STYLE: StyleObject = {
  userSelect: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function rootStyle(given: DivAttributes["style"]): Style {
  const value = typeof given === "function" ? given() : given;
  if (value === undefined) return ROOT_STYLE;
  if (typeof value === "string") {
    return `user-select: text; white-space: pre-wrap; word-break: break-word; ${value}`;
  }
  return { ...ROOT_STYLE, ...value };
}

interface PlaceholderProps {
  editor: LexicalEditor;
  content: PlaceholderContent;
}

function Placeholder(props: PlaceholderProps): JSX.Element {
  const editor = props.editor;
  const content = props.content;
  const canShow = useLexicalCanShowPlaceholder(editor);
  const isEditable = watchEditable(editor);
  return (
    <Show when={canShow()}>
      <div aria-hidden="true">
        {typeof content === "function" && !isBlock(content) ? content(isEditable()) : content}
      </div>
    </Show>
  );
}

/**
 * The editable root of the editor in scope, with an optional placeholder shown
 * while the document is empty.
 */
export function ContentEditable(props: ContentEditableProps): JSX.Element {
  const editor = useLexicalEditor();
  const placeholder = props.placeholder;
  return (
    <>
      <ContentEditableElement editor={editor} {...omit(props, "placeholder")} />
      {placeholder === undefined || placeholder === null ? null : (
        <Placeholder editor={editor} content={placeholder} />
      )}
    </>
  );
}
