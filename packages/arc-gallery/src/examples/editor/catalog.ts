import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "editor",
  title: "Editor",
  description:
    "Rich text, blocks, the renderer and the typeaheads for mentions, emoji and commands.",
  examples: [
    {
      id: "rich-text-editor",
      title: "Rich text editor",
      description:
        "The full editor: the toolbar, marks over a selection, links on Mod+K, tables, images uploaded with their progress, embeds, people after @ from the server, commands after /, emoji after :, a limit and autosave.",
      covers: [
        "RichTextEditor",
        "EditorToolbar",
        "FloatingFormatToolbar",
        "LinkEditor",
        "TableControls",
        "MentionTypeahead",
        "SlashCommandMenu",
        "EmojiShortcuts",
        "EditorUploads",
        "documentToMarkdown",
      ],
    },
    {
      id: "editor-parts",
      title: "Editor parts and hooks",
      description:
        "A smaller toolbar, a floating toolbar of three marks, a table sized from a grid outside the editor, and a footer of the editor's own built from useCharacterCount and useEditorAutosave.",
      covers: [
        "TableSizePicker",
        "FloatingFormatToolbar",
        "insertTable",
        "insertDivider",
        "useCharacterCount",
        "useEditorAutosave",
      ],
    },
    {
      id: "editor-states",
      title: "Editor states",
      description:
        "Empty with a placeholder, read-only, invalid, and plain and small with a character limit.",
      covers: ["RichTextEditor"],
    },
    {
      id: "block-editor",
      title: "Block editor",
      description:
        "A page a block at a time: + and the grip beside each block, Turn into, moving blocks with Mod+Shift and the arrows, and two blocks of Acme's own made with defineBlock.",
      covers: ["BlockEditor", "defineBlock"],
    },
    {
      id: "document-editor",
      title: "Document editing",
      description:
        "Formatting over selected text (turn into, sub and superscript, colours, highlight, sizes, clear), the block menu by right-click and Mod+/, tables with grips, merge, colour and stripes, code blocks with a language menu, line numbers and copy, the markdown dialog, a document's own direction and a validated editor.",
      covers: [
        "formattingExtension",
        "TextColourMenu",
        "TextSizeMenu",
        "TableControls",
        "CodeBlockTools",
        "MarkdownDialog",
        "replaceDocument",
        "BlockEditor",
        "RichTextEditor",
      ],
    },
    {
      id: "renderer",
      title: "Rich text renderer",
      description:
        "A stored document drawn without an editor, its mentions, custom blocks, table and code included, and markdown drawn directly.",
      covers: ["RichTextRenderer", "markdownToDocument", "documentToText"],
    },
    {
      id: "message-editor",
      title: "Message editor",
      description:
        "A sent message edited in place: Enter saves, Escape cancels, mentions from the server.",
      covers: ["MessageEditor"],
    },
  ],
};
