import type { Demos } from "../../gallery/types.ts";
import BlockEditor from "./block-editor.tsx";
import DocumentEditor from "./document-editor.tsx";
import documentEditor from "./document-editor.tsx?raw";
import blockEditor from "./block-editor.tsx?raw";
import EditorParts from "./editor-parts.tsx";
import editorParts from "./editor-parts.tsx?raw";
import EditorStates from "./editor-states.tsx";
import editorStates from "./editor-states.tsx?raw";
import MessageEditor from "./message-editor.tsx";
import messageEditor from "./message-editor.tsx?raw";
import Renderer from "./renderer.tsx";
import renderer from "./renderer.tsx?raw";
import RichTextEditor from "./rich-text-editor.tsx";
import richTextEditor from "./rich-text-editor.tsx?raw";

export const demos: Demos = {
  "rich-text-editor": { component: RichTextEditor, code: richTextEditor },
  "editor-parts": { component: EditorParts, code: editorParts },
  "editor-states": { component: EditorStates, code: editorStates },
  "block-editor": { component: BlockEditor, code: blockEditor },
  "document-editor": { component: DocumentEditor, code: documentEditor },
  renderer: { component: Renderer, code: renderer },
  "message-editor": { component: MessageEditor, code: messageEditor },
};
