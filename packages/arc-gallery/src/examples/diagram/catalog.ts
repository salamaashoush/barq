import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "diagram",
  title: "Diagram",
  description: "A whiteboard editor on Excalidraw's element model.",
  examples: [
    {
      id: "diagram-editor",
      title: "Diagram editor",
      description:
        "Acme's architecture as shapes, labels and bound arrows: draw, move and bind, with the editor's API driving tools, zoom to fit, SVG, PNG and JSON export, grid and view mode.",
      covers: [
        "DiagramEditor",
        "DiagramEditorApi",
        "exportToSvg",
        "exportToBlob",
        "serializeAsJSON",
        "convertToExcalidrawElements",
      ],
    },
    {
      id: "diagram-viewer",
      title: "Diagram viewer",
      description:
        "The same scene read-only: pan, zoom and fit, rendered on the server and drawn on a canvas once hydrated.",
      covers: ["DiagramViewer", "DiagramViewerApi"],
    },
  ],
};
