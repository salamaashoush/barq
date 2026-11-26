import type { Demos } from "../../gallery/types.ts";
import EditorTabs from "./editor-tabs.tsx";
import editorTabs from "./editor-tabs.tsx?raw";
import FileExplorer from "./file-explorer.tsx";
import fileExplorer from "./file-explorer.tsx?raw";
import Repl from "./repl.tsx";
import repl from "./repl.tsx?raw";
import ReplEditor from "./repl-editor.tsx";
import replEditor from "./repl-editor.tsx?raw";
import Workspace from "./workspace.tsx";
import workspace from "./workspace.tsx?raw";

export const demos: Demos = {
  workspace: { component: Workspace, code: workspace },
  repl: { component: Repl, code: repl },
  "repl-editor": { component: ReplEditor, code: replEditor },
  "editor-tabs": { component: EditorTabs, code: editorTabs },
  "file-explorer": { component: FileExplorer, code: fileExplorer },
};
