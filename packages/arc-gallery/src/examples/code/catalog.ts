import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "code",
  title: "Code",
  description: "A code editor, diffs and highlighted blocks.",
  examples: [
    {
      id: "code-editor",
      title: "Code editor",
      description:
        "An editable editor whose language is switched live, each language loaded on first use or all at once, Mod+Enter to run.",
      covers: ["CodeEditor", "loadLanguage"],
    },
    {
      id: "code-editor-states",
      title: "Code editor states",
      description:
        "Read-only, empty with a placeholder, invalid with a description, and wrapped without line numbers.",
      covers: ["CodeEditor"],
    },
    {
      id: "code-diff",
      title: "Code diff",
      description:
        "Two versions side by side or unified, unchanged stretches folded, and the new side editable.",
      covers: ["CodeDiff"],
    },
    {
      id: "code-block",
      title: "Code block and highlight",
      description:
        "Code to read and copy, with a filename, line numbers and a height limit, and Highlight, the code alone.",
      covers: ["CodeBlock", "Highlight"],
    },
  ],
};
