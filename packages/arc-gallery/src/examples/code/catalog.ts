import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "code",
  title: "Code",
  description:
    "A code editor, diffs, highlighted blocks, terminal commands, setup tabs, logs and schemas.",
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
    {
      id: "code-excerpt",
      title: "Marked lines, excerpts and bodies",
      description:
        "The lines around a failure numbered as in the file, a body highlighted by its content type, and editors that fold with a line marked.",
      covers: [
        "CodeBlock",
        "rangeAround",
        "languageForContentType",
        "prettyJson",
        "CodeEditor",
        "lineMarks",
      ],
    },
    {
      id: "terminal",
      title: "Terminal commands",
      description:
        "A prompt a copy leaves out, continued lines, a transcript with its output, and the light highlighter.",
      covers: ["TerminalBlock", "lightHighlightLines", "Highlight"],
    },
    {
      id: "code-tabs",
      title: "Setup snippets",
      description:
        "Install commands per platform rewritten by an option, the reader's own values swapped in, and tabs that share a remembered choice.",
      covers: [
        "CodeTabs",
        "shellQuote",
        "SnippetValuesProvider",
        "SnippetValue",
        "useSnippetValues",
        "readerOrigin",
      ],
    },
    {
      id: "editor-tools",
      title: "Completion, checking and template tokens",
      description:
        "A language server's completion, docs and diagnostics, names after a trigger, and a text field that references variables and secrets.",
      covers: ["languageClient", "serveLanguageServer", "tokenCompletions", "TemplateTokenField"],
    },
    {
      id: "language-server",
      title: "Language server",
      description:
        "Two files of a toy language on an in-page language server: completion, hover, diagnostics with a fix, semantic colours, inlay hints, lenses, folding, definition across files, rename, an outline, problems and progress.",
      covers: [
        "languageClient",
        "defineLanguage",
        "serveLanguageServer",
        "portTransport",
        "symbolNodes",
        "OutlineView",
      ],
    },
    {
      id: "console-log",
      title: "Console log",
      description:
        "Levelled lines filtered by level and text, JSON opened in place, colour codes, a live stream that follows, and the loading and error states.",
      covers: ["ConsoleLogView"],
    },
    {
      id: "json-schema",
      title: "JSON schema fields",
      description:
        "A schema's fields with types, values and defaults, nesting and variants opened in place, and an example value from it.",
      covers: ["JsonSchemaFields", "jsonSchemaExample"],
    },
  ],
};
