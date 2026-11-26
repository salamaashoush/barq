import type { Demos } from "../../gallery/types.ts";
import CodeBlock from "./code-block.tsx";
import codeBlock from "./code-block.tsx?raw";
import CodeDiff from "./code-diff.tsx";
import codeDiff from "./code-diff.tsx?raw";
import CodeEditorStates from "./code-editor-states.tsx";
import codeEditorStates from "./code-editor-states.tsx?raw";
import CodeEditor from "./code-editor.tsx";
import codeEditor from "./code-editor.tsx?raw";
import CodeExcerpt from "./code-excerpt.tsx";
import codeExcerpt from "./code-excerpt.tsx?raw";
import CodeTabs from "./code-tabs.tsx";
import codeTabs from "./code-tabs.tsx?raw";
import ConsoleLog from "./console-log.tsx";
import consoleLog from "./console-log.tsx?raw";
import EditorTools from "./editor-tools.tsx";
import editorTools from "./editor-tools.tsx?raw";
import JsonSchema from "./json-schema.tsx";
import jsonSchema from "./json-schema.tsx?raw";
import Terminal from "./terminal.tsx";
import terminal from "./terminal.tsx?raw";

export const demos: Demos = {
  "code-editor": { component: CodeEditor, code: codeEditor },
  "code-editor-states": { component: CodeEditorStates, code: codeEditorStates },
  "code-diff": { component: CodeDiff, code: codeDiff },
  "code-block": { component: CodeBlock, code: codeBlock },
  "code-excerpt": { component: CodeExcerpt, code: codeExcerpt },
  terminal: { component: Terminal, code: terminal },
  "code-tabs": { component: CodeTabs, code: codeTabs },
  "editor-tools": { component: EditorTools, code: editorTools },
  "console-log": { component: ConsoleLog, code: consoleLog },
  "json-schema": { component: JsonSchema, code: jsonSchema },
};
