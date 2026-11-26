import { calloutExtension } from "./callout.tsx";
import { codeToolsExtension } from "./code-tools.tsx";
import { columnsExtension } from "./columns.tsx";
import {
  autoLinkExtension,
  dividerExtension,
  embedExtension,
  mentionExtension,
  richTextExtension,
  tableExtension,
} from "./core.tsx";
import { documentStatusExtension } from "./document-status.tsx";
import { wordImportExtension } from "./docx-import.tsx";
import type { EditorExtension } from "./extension.ts";
import { findExtension } from "./find-panel.tsx";
import { footnoteExtension } from "./footnote.tsx";
import { markdownDialogExtension } from "./markdown-dialog.tsx";
import { formattingExtension } from "./formatting.tsx";
import { pasteExtension } from "./paste.ts";
import { imageExtension } from "./picture-extension.tsx";
import { picturesExtension } from "./pictures.tsx";
import { PageBreakBlock } from "./page-break.tsx";
import { panelsExtension } from "./panels.tsx";
import { sharedBlockExtension } from "./shared-block.tsx";
import { toggleExtension } from "./toggle.tsx";

/**
 * A document: rich text with colours and sizes, tables, dividers, images,
 * embeds and mentions, and every generic block arc has.
 */
export const documentPreset: readonly EditorExtension[] = [
  richTextExtension,
  formattingExtension,
  autoLinkExtension,
  tableExtension,
  dividerExtension,
  imageExtension(),
  picturesExtension(),
  embedExtension(),
  mentionExtension,
  calloutExtension,
  columnsExtension,
  toggleExtension,
  panelsExtension(),
  sharedBlockExtension(),
  PageBreakBlock,
  footnoteExtension,
  findExtension,
  documentStatusExtension,
  pasteExtension,
  wordImportExtension,
  markdownDialogExtension,
  codeToolsExtension,
];

/** A message: rich text, links, images and mentions, nothing laid out as a page. */
export const chatPreset: readonly EditorExtension[] = [
  richTextExtension,
  autoLinkExtension,
  dividerExtension,
  imageExtension(),
  embedExtension(),
  mentionExtension,
  pasteExtension,
];

/** A comment on something: rich text, links and mentions. */
export const commentPreset: readonly EditorExtension[] = [
  richTextExtension,
  autoLinkExtension,
  mentionExtension,
  pasteExtension,
];
