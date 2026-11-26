import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "files",
  title: "Files, tabs and REPL",
  description:
    "A workspace's files in a tree, its open documents as tabs, a REPL that streams what each input prints, and splits that remember their sizes.",
  examples: [
    {
      id: "workspace",
      title: "Workspace",
      description:
        "Files, open documents and a REPL in splits whose sizes are kept across visits: open a file from the tree, edit it, run it.",
      covers: ["FileExplorer", "EditorTabs", "Repl", "virtualFs", "ResizablePanelGroup"],
    },
    {
      id: "repl",
      title: "REPL",
      description:
        "A toy calculator: Enter runs, an open bracket adds a line, Up and Down walk a remembered history, output streams with colours and Stop aborts.",
      covers: ["Repl", "bracketsBalanced", "ReplOutput", "AnsiText"],
    },
    {
      id: "repl-editor",
      title: "REPL with an editor",
      description: "The same REPL typed in a highlighted code editor, which takes the REPL's keys.",
      covers: ["Repl", "ReplInputField", "CodeEditor"],
    },
    {
      id: "editor-tabs",
      title: "Editor tabs",
      description:
        "Open documents with unsaved dots, closed by button, middle click or Delete, dragged or moved from the keyboard, pinned, and closed in bulk from a tab's menu.",
      covers: ["EditorTabs", "ResponsiveTabs", "TabItem"],
    },
    {
      id: "file-explorer",
      title: "File explorer",
      description:
        "Files and folders made, renamed in place, dragged into folders and deleted after asking, kept in a store that serialises to a plain object.",
      covers: ["FileExplorer", "virtualFs", "VirtualFs", "TreeView"],
    },
  ],
};
