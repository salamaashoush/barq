import { Show, untrack } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { CollaborationPlugin, LexicalCollaboration } from "@barqjs/lexical/collaboration";
import type { Provider } from "@lexical/yjs";
import type { Doc } from "yjs";

import { TONES, type Tone, tone as toneTokens } from "../theme/tokens.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

/** The tone a collaborator's cursor is drawn in: the same for the same name on every screen. */
export function collaboratorTone(name: string): Tone {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  const tones = TONES.filter((one) => one !== "neutral");
  return tones[hash % tones.length] ?? "info";
}

export interface EditorCollaborationProps {
  /** The shared document's id, which `providerFactory` is handed. */
  id: string;
  /** Makes the provider for the document, and puts its Yjs `Doc` in `docs` under `id`. */
  providerFactory: (id: string, docs: Map<string, Doc>) => Provider;
  /** Seeds an empty shared document. One client at most: a server is the safer place. */
  shouldBootstrap?: boolean;
  /** The name the others see on this user's cursor. */
  username: string;
  /** The tone this user's cursor is drawn in. @default one picked from the name */
  tone?: Tone;
  /** Other users' selections drawn with the CSS Highlight API where the browser has it. @default true */
  selectionHighlight?: boolean;
  /** Anything else to publish in this user's awareness state: an avatar, a role. */
  awarenessData?: object;
}

/**
 * A `RichTextEditor` on a shared Yjs document, through `@barqjs/lexical`'s
 * binding: put it inside an editor marked `collaborative`, which opens empty
 * for the shared state to fill and leaves undo to the shared document.
 *
 * ```tsx
 * import { EditorCollaboration } from "@barqjs/arc/editor/collaboration";
 *
 * <RichTextEditor label="Notes" collaborative>
 *   <EditorCollaboration id={page.id} username={me.name} providerFactory={connect} />
 * </RichTextEditor>
 * ```
 *
 * The other users' cursors are drawn in arc's tones, each picked from their
 * name so it is the same on every screen, with their name above the caret.
 * It is an entry of its own so an editor that is never shared loads no Yjs.
 */
export function EditorCollaboration(props: EditorCollaborationProps) {
  const editor = useLexicalEditor();
  // The editor's own scroller, so the others' cursors scroll with the text:
  // known once the editor has its root, which it takes as the page mounts.
  const [scroller, setScroller] = editorSignal<HTMLElement | null>(
    editor.getRootElement()?.parentElement ?? null,
  );
  useRegistration(() =>
    editor.registerRootListener((root) => setScroller(root?.parentElement ?? null)),
  );
  const color = untrack(() => toneTokens(props.tone ?? collaboratorTone(props.username)).base);
  return (
    <Show when={scroller()}>
      {(container: () => HTMLElement) => (
        <LexicalCollaboration>
          <CollaborationPlugin
            id={props.id}
            providerFactory={props.providerFactory}
            shouldBootstrap={props.shouldBootstrap ?? false}
            username={props.username}
            cursorColor={color}
            cursorsContainer={container()}
            selectionHighlight={props.selectionHighlight ?? true}
            awarenessData={props.awarenessData}
          />
        </LexicalCollaboration>
      )}
    </Show>
  );
}
