import { calloutExtension } from "./callout.tsx";
import { columnsExtension } from "./columns.tsx";
import {
  autoLinkExtension,
  dividerExtension,
  embedExtension,
  imageExtension,
  mentionExtension,
  richTextExtension,
  tableExtension,
} from "./core.tsx";
import { documentStatusExtension } from "./document-status.tsx";
import type { EditorExtension } from "./extension.ts";
import { findExtension } from "./find-panel.tsx";
import { footnoteExtension } from "./footnote.tsx";
import { PageBreakBlock } from "./page-break.tsx";
import { toggleExtension } from "./toggle.tsx";

/**
 * A document: rich text, tables, dividers, images, embeds and mentions,
 * and every generic block arc has.
 */
export const documentPreset: readonly EditorExtension[] = [
  richTextExtension,
  autoLinkExtension,
  tableExtension,
  dividerExtension,
  imageExtension,
  embedExtension(),
  mentionExtension,
  calloutExtension,
  columnsExtension,
  toggleExtension,
  PageBreakBlock,
  footnoteExtension,
  findExtension,
  documentStatusExtension,
];

/** A message: rich text, links, images and mentions, nothing laid out as a page. */
export const chatPreset: readonly EditorExtension[] = [
  richTextExtension,
  autoLinkExtension,
  dividerExtension,
  imageExtension,
  embedExtension(),
  mentionExtension,
];

/** A comment on something: rich text, links and mentions. */
export const commentPreset: readonly EditorExtension[] = [
  richTextExtension,
  autoLinkExtension,
  mentionExtension,
];
