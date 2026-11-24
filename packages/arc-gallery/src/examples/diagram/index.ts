import type { Demos } from "../../gallery/types.ts";
import DiagramEditor from "./diagram-editor.tsx";
import diagramEditor from "./diagram-editor.tsx?raw";
import DiagramViewer from "./diagram-viewer.tsx";
import diagramViewer from "./diagram-viewer.tsx?raw";

export const demos: Demos = {
  "diagram-editor": { component: DiagramEditor, code: diagramEditor },
  "diagram-viewer": { component: DiagramViewer, code: diagramViewer },
};
