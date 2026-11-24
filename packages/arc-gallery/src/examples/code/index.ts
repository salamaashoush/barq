import type { Demos } from "../../gallery/types.ts";
import CodeBlock from "./code-block.tsx";
import codeBlock from "./code-block.tsx?raw";
import CodeDiff from "./code-diff.tsx";
import codeDiff from "./code-diff.tsx?raw";
import CodeEditorStates from "./code-editor-states.tsx";
import codeEditorStates from "./code-editor-states.tsx?raw";
import CodeEditor from "./code-editor.tsx";
import codeEditor from "./code-editor.tsx?raw";

export const demos: Demos = {
  "code-editor": { component: CodeEditor, code: codeEditor },
  "code-editor-states": { component: CodeEditorStates, code: codeEditorStates },
  "code-diff": { component: CodeDiff, code: codeDiff },
  "code-block": { component: CodeBlock, code: codeBlock },
};
