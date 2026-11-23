import { Show, isBlock, omit } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
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
}

/** Shown over an empty editor: JSX, or a function of whether the editor is editable. */
export type PlaceholderContent = JSX.Element | ((isEditable: boolean) => JSX.Element);

export interface ContentEditableProps extends DivAttributes {
  placeholder?: PlaceholderContent | null;
  "aria-placeholder"?: string;
}

const OWNED = [
  "editor",
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
 * On the server it is the same `<div>`, empty: the editor fills it once it is
 * hydrated and bound.
 */
export function ContentEditableElement(props: ContentEditableElementProps): JSX.Element {
  const editor = props.editor;
  const isEditable = watchEditable(editor);

  const role = (): string | undefined => {
    const given = props.role as string | undefined;
    if (given !== undefined) return given;
    return isEditable() || hasName([props["aria-label"], props["aria-labelledby"], props.title])
      ? "textbox"
      : undefined;
  };
  // Widget attributes mean nothing on an element with no role.
  const widget = (): boolean => role() !== undefined;

  const bind = (element: HTMLDivElement): (() => void) => {
    // A root element needs a window: a frame being torn down has none.
    editor.setRootElement(element.ownerDocument.defaultView === null ? null : element);
    return () => editor.setRootElement(null);
  };

  return (
    <div
      {...omit(props, ...OWNED)}
      ref={props.ref === undefined ? bind : [props.ref, bind]}
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
    />
  );
}

function Placeholder(props: { editor: LexicalEditor; content: PlaceholderContent }): JSX.Element {
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
