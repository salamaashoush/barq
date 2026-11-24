import {
  autoLinkExtension,
  dividerExtension,
  embedExtension,
  imageExtension,
  mentionExtension,
  richTextExtension,
  tableExtension,
} from "./core.tsx";
import type { EditorExtension } from "./extension.ts";

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
