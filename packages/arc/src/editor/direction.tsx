import { isRTL, useLocale } from "@barqjs/aria/i18n";
import { useLexicalEditor } from "@barqjs/lexical";
import { $getRoot, type LexicalEditor, type NodeKey, mergeRegister } from "lexical";

import { useRegistration } from "./hooks.ts";

import { type TextDirection, hasStrongLetter, textDirection } from "../lib/text-direction.ts";

export { type TextDirection, textDirection };

const NEUTRAL = '[dir="auto"], [data-neutral-dir]';

/** The direction a document's own words read in: its first strong letter's. */
export function $documentDirection(): TextDirection | null {
  for (let block = $getRoot().getFirstChild(); block !== null; block = block.getNextSibling()) {
    const found = textDirection(block.getTextContent());
    if (found !== null) return found;
  }
  return null;
}

/** The direction a document written in `language` reads in. */
export function languageDirection(language: string): TextDirection {
  return isRTL(language) ? "rtl" : "ltr";
}

/** A block marked to read in its own direction holds no letter yet: it reads in the document's. */
function settle(element: HTMLElement, direction: TextDirection): void {
  const neutral = !hasStrongLetter(element.textContent ?? "");
  const dir = neutral ? direction : "auto";
  if (element.getAttribute("dir") !== dir) element.setAttribute("dir", dir);
  if (neutral !== element.hasAttribute("data-neutral-dir")) {
    element.toggleAttribute("data-neutral-dir", neutral);
  }
}

function documentDirectionOf(
  editor: LexicalEditor,
  language: string | undefined,
): TextDirection | null {
  return language === undefined
    ? editor.getEditorState().read($documentDirection)
    : languageDirection(language);
}

/**
 * Keeps the editor in scope in its document's own direction, not the
 * interface's: an English note written from an Arabic interface puts its
 * lists, pictures and empty lines on the left. The direction is `language`'s
 * when one is set, else the document's first letter's, else the interface's.
 *
 * Each block takes the direction of its own text, as `dir="auto"`; a block
 * with no letter in it (an empty line, a number, a date) would then read
 * left to right even in an Arabic document, putting the caret and the block
 * handles on the wrong side. Such a block follows the document's direction
 * until it holds a letter.
 */
export function useDocumentDirection(language: () => string | undefined): void {
  const editor = useLexicalEditor();
  const locale = useLocale();
  let settled: TextDirection | null = null;

  function apply(changed?: ReadonlyMap<NodeKey, boolean>): void {
    const root = editor.getRootElement();
    const outer = root?.parentElement ?? null;
    if (root === null || outer === null) return;
    const direction = documentDirectionOf(editor, language()) ?? locale().direction;
    // Setting dir, even to the value it has, restyles the whole document.
    if (outer.getAttribute("dir") !== direction) outer.setAttribute("dir", direction);
    // Typing changes one block, so an update revisits only the blocks it
    // touched; a new direction revisits them all.
    const whole = changed === undefined || direction !== settled;
    settled = direction;
    if (whole) {
      for (const element of root.querySelectorAll<HTMLElement>(NEUTRAL)) settle(element, direction);
      return;
    }
    for (const key of changed.keys()) {
      const element = editor.getElementByKey(key);
      if (element !== null && element !== root && element.matches(NEUTRAL)) {
        settle(element, direction);
      }
    }
  }

  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(({ dirtyElements }) => apply(dirtyElements)),
      editor.registerRootListener(() => apply()),
    ),
  );
}
