import { For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { overlayPosition, portalContainer, usePortalTarget } from "@barqjs/aria/overlays";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { useLexicalEditor } from "@barqjs/lexical";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Portal } from "@barqjs/web";
import { $isCodeNode, CodeNode } from "@lexical/code-core";
import { $findMatchingParent } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type NodeKey,
  mergeRegister,
} from "lexical";

import { languageNames } from "../code/languages.ts";
import { CopyButton } from "../components/copy-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, elevation, gap, glyph, layout, rounded, type, zIndex } from "../style/index.ts";
import { codeGutter } from "./code-gutter.ts";
import { defineEditorExtension } from "./extension.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

/** Languages by the names they go by, for the ones whose own name is not how they are written. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  javascript: "JavaScript",
  jsx: "JSX",
  typescript: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  markdown: "Markdown",
  python: "Python",
  xml: "XML",
  yaml: "YAML",
  sql: "SQL",
};

/** The short names a fence is often written with, by the language each names. */
const ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  md: "markdown",
  yml: "yaml",
  htm: "html",
  svg: "xml",
  jsonc: "json",
};

/** A language by the one name the menu offers it under: `typescript` for `ts`. */
export function codeLanguageOf(language: string): string {
  const name = language.toLowerCase();
  return ALIASES[name] ?? name;
}

/** A language as it is written: `TypeScript` for `ts` and `typescript`, the name itself for one arc has no word for. */
export function codeLanguageName(language: string): string {
  return LANGUAGE_NAMES[codeLanguageOf(language)] ?? language;
}

export const codeToolsStyles = variants({
  slots: {
    root: arc(layout.row, gap[0.5], rounded.md, elevation.raised, bg.page, {
      zIndex: zIndex.popover,
    }),
    language: arc(gap[1], type.caption),
    chevron: arc(glyph.sm),
  },
});

type Slots = ReturnType<typeof codeToolsStyles>;

interface ActiveCode {
  key: NodeKey;
  language: string;
  text: string;
}

function setLanguage(editor: LexicalEditor, key: NodeKey, language: string): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if ($isCodeNode(node)) node.setLanguage(language === "" ? null : language);
  });
}

export interface CodeBlockToolsProps extends Customisable<Slots> {}

/**
 * While the caret is in a code block, at its top corner: the block's
 * language, chosen from a menu of every language arc highlights, and a
 * button that copies its code. A code block reads left to right whatever
 * the document's direction, and so does this.
 */
export function CodeBlockTools(props: CodeBlockToolsProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const portal = usePortalTarget();
  const barRef = makeRef<HTMLDivElement>();
  const [active, setActive] = editorSignal<ActiveCode | null>(null);
  const languages = languageNames().toSorted((a, b) =>
    codeLanguageName(a).localeCompare(codeLanguageName(b)),
  );
  function cls(): Slots {
    return parts(codeToolsStyles(), props.classes);
  }
  function read(): void {
    const found = editor.read(() => {
      const selection = $getSelection();
      if (!editor.isEditable() || !$isRangeSelection(selection)) return null;
      const code = $findMatchingParent(selection.anchor.getNode(), $isCodeNode);
      return $isCodeNode(code)
        ? {
            key: code.getKey(),
            language: codeLanguageOf(code.getLanguage() ?? ""),
            text: code.getTextContent(),
          }
        : null;
    });
    setActive(found);
  }
  useRegistration(() => mergeRegister(editor.registerUpdateListener(read)));
  const position = overlayPosition({
    targetRef: () => (active() === null ? null : editor.getElementByKey(active()!.key)),
    overlayRef: barRef,
    placement: () => "top end",
    offset: () => -34,
    crossOffset: () => -4,
    isOpen: () => active() !== null,
    direction: () => "ltr",
  });
  return (
    <Show when={active()}>
      {(code: () => ActiveCode) => (
        <Portal mount={portalContainer(portal)}>
          <div
            {...position.overlayProps}
            ref={barRef.set}
            class={arc(cls().root, props.class, props.className)}
            data-slot="code-block-tools"
            dir="ltr"
          >
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="ghost"
                  size="xs"
                  class={cls().language}
                  aria-label={`${messages().codeLanguage}: ${
                    code().language === "" ? messages().plainText : codeLanguageName(code().language)
                  }`}
                  data-slot="code-language"
                >
                  <span>
                    {code().language === "" ? messages().plainText : codeLanguageName(code().language)}
                  </span>
                  <ChevronDown class={cls().chevron} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent aria-label={messages().codeLanguage} align="end">
                <DropdownMenuRadioGroup
                  value={code().language}
                  onValueChange={(value: string) => {
                    setLanguage(editor, code().key, value);
                    editor.focus();
                  }}
                >
                  <DropdownMenuRadioItem value="">{messages().plainText}</DropdownMenuRadioItem>
                  <For each={languages}>
                    {(name: string) => (
                      <DropdownMenuRadioItem value={name}>
                        {codeLanguageName(name)}
                      </DropdownMenuRadioItem>
                    )}
                  </For>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <CopyButton value={code().text} label={messages().copyCode} size="icon-xs" />
          </div>
        </Portal>
      )}
    </Show>
  );
}

/** Numbers the lines of every code block the editor draws, on its element, for the theme's gutter to show. */
function registerGutters(editor: LexicalEditor): () => void {
  return editor.registerMutationListener(
    CodeNode,
    (mutations) => {
      editor.getEditorState().read(() => {
        for (const [key, mutation] of mutations) {
          if (mutation === "destroyed") continue;
          const node = $getNodeByKey(key);
          const element = editor.getElementByKey(key);
          if (!$isCodeNode(node) || element === null) continue;
          const gutter = codeGutter(node.getTextContent());
          if (element.getAttribute("data-gutter") !== gutter) {
            element.setAttribute("data-gutter", gutter);
          }
        }
      });
    },
    { skipInitialization: false },
  );
}

/**
 * Code blocks worked on in place: their lines numbered beside them, and
 * while the caret is in one, its language from a menu and a button that
 * copies it. A copy of the text leaves the numbers out, as CSS draws them.
 */
export const codeToolsExtension = defineEditorExtension({
  name: "arc/code-tools",
  plugins: [
    () => {
      const editor = useLexicalEditor();
      useRegistration(() => registerGutters(editor));
      return <CodeBlockTools />;
    },
  ],
});
