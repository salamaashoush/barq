import { For, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLexicalEditor, useLexicalEditorState } from "@barqjs/lexical";
import { ALargeSmall } from "@barqjs/lucide/icons/a-large-small";
import { Baseline } from "@barqjs/lucide/icons/baseline";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { RemoveFormatting } from "@barqjs/lucide/icons/remove-formatting";
import { Subscript } from "@barqjs/lucide/icons/subscript";
import { Superscript } from "@barqjs/lucide/icons/superscript";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { $getSelectionStyleValueForProperty, $patchStyleText } from "@lexical/selection";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type DOMChildConversion,
  type DOMConversionOutput,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
  TextNode,
  defineExtension,
} from "lexical";

import { ColorSwatches, type SwatchColor } from "../components/color.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, place, type } from "../style/index.ts";
import { defineEditorExtension } from "./extension.ts";
import {
  EDITOR_COLOURS,
  type EditorColour,
  HIGHLIGHT_COLOURS,
  TEXT_COLOURS,
  TEXT_SIZES,
  type TextSize,
  sanitiseStyle,
} from "./text-style.ts";

const SIZE_NAMES: readonly (TextSize | "normal")[] = ["small", "normal", "large", "huge"];

/** The colour, highlight and size of the selected text: empty or `null` where it has none of its own, or several. */
export interface SelectionStyle {
  colour: string;
  highlight: string;
  size: TextSize | null;
}

/** The selection's colour, highlight and size, read inside an editor state read. */
export function $selectionStyle(): SelectionStyle {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return { colour: "", highlight: "", size: null };
  const size = $getSelectionStyleValueForProperty(selection, "font-size", "");
  return {
    colour: $getSelectionStyleValueForProperty(selection, "color", ""),
    highlight: $getSelectionStyleValueForProperty(selection, "background-color", ""),
    size: (Object.keys(TEXT_SIZES) as TextSize[]).find((one) => TEXT_SIZES[one] === size) ?? null,
  };
}

function $patch(property: string, value: string | null): void {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) $patchStyleText(selection, { [property]: value });
}

/** Colours the selected text, or gives it back the colour around it with `null`. */
export function $setTextColour(value: string | null): void {
  $patch("color", value);
}

/** Highlights the selected text, or takes the highlight off with `null`. */
export function $setHighlight(value: string | null): void {
  $patch("background-color", value);
}

/** Sizes the selected text, or gives it back the size around it with `null`. */
export function $setTextSize(size: TextSize | null): void {
  $patch("font-size", size === null ? null : TEXT_SIZES[size]);
}

/**
 * The selected text back to plain words: no marks, colour, highlight, size or
 * font. A link stays, being where the words go rather than how they look.
 */
export function $clearFormatting(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  $patchStyleText(selection, {
    color: null,
    "background-color": null,
    "font-size": null,
    "font-family": null,
  });
  for (const node of selection.extract()) if ($isTextNode(node)) node.setFormat(0);
  selection.setFormat(0);
  selection.setStyle("");
}

function format(editor: LexicalEditor, mark: TextFormatType): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark);
}

function $hasFormat(mark: TextFormatType): boolean {
  const selection = $getSelection();
  return $isRangeSelection(selection) && selection.hasFormat(mark);
}

/**
 * A styled `<span>` read as Lexical reads it, its bold or italic from the
 * style, and its colour, highlight, size and font kept on the text in it,
 * which Lexical's own reading leaves behind.
 */
function convertStyledSpan(element: HTMLElement): DOMConversionOutput {
  const own = TextNode.importDOM?.()?.span?.(element)?.conversion(element) ?? { node: null };
  const style = sanitiseStyle(element.style.cssText);
  if (style === "") return own;
  const formats = own.forChild;
  const forChild: DOMChildConversion = (child: LexicalNode, parent) => {
    const node = formats === undefined ? child : formats(child, parent);
    if ($isTextNode(node)) {
      node.setStyle(node.getStyle() === "" ? style : `${style}; ${node.getStyle()}`);
    }
    return node;
  };
  return { ...own, forChild };
}

const StyledHtmlExtension = defineExtension({
  name: "@barqjs/arc/styled-html",
  html: {
    import: {
      span: () => ({ conversion: convertStyledSpan, priority: 1 }),
    },
  },
});

export const formatMenuStyles = variants({
  slots: {
    trigger: arc(gap[0.5]),
    chevron: arc(glyph.sm),
    popover: arc(layout.column, gap[3], place.padded),
    heading: arc(type.caption, type.medium, fg.muted),
    row: arc(layout.row, layout.between, gap[2]),
    sample: arc({ minInlineSize: "4.5rem" }),
  },
});

type FormatMenuSlots = ReturnType<typeof formatMenuStyles>;

export interface TextColourMenuProps extends Customisable<FormatMenuSlots> {}

/**
 * The selected text's colour and highlight, each from nine colours or back to
 * the default, in a popover from a button: arc's colour swatches, so the
 * arrows move through them and each is named.
 */
export function TextColourMenu(props: TextColourMenuProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const style = useLexicalEditorState($selectionStyle);
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  function cls(): FormatMenuSlots {
    return parts(formatMenuStyles(), props.classes);
  }
  function swatches(table: Readonly<Record<EditorColour, string>>): SwatchColor[] {
    return EDITOR_COLOURS.map((name) => ({
      color: table[name],
      label: messages().colourName(name),
    }));
  }
  function apply(change: () => void): void {
    editor.update(change);
    setOpen(false);
    editor.focus();
  }
  return (
    <Popover isOpen={open()} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          size="sm"
          class={arc(cls().trigger, props.class, props.className)}
          aria-label={messages().textColour}
          title={messages().textColour}
          data-slot="text-colour-trigger"
        >
          <Baseline
            aria-hidden="true"
            style={style().colour === "" ? undefined : { color: style().colour }}
          />
          <ChevronDown class={cls().chevron} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        class={cls().popover}
        align="start"
        aria-label={messages().textColour}
        data-slot="text-colour-menu"
      >
        <For each={["colour", "highlight"] as const}>
          {(kind: "colour" | "highlight") => (
            <>
              <div class={cls().row}>
                <span class={cls().heading}>
                  {kind === "colour" ? messages().textColour : messages().highlight}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  data-slot={`text-${kind}-default`}
                  onPress={() =>
                    apply(() => (kind === "colour" ? $setTextColour(null) : $setHighlight(null)))
                  }
                >
                  {messages().defaultColour}
                </Button>
              </div>
              <ColorSwatches
                aria-label={kind === "colour" ? messages().textColour : messages().highlight}
                colors={swatches(kind === "colour" ? TEXT_COLOURS : HIGHLIGHT_COLOURS)}
                size="sm"
                value={(kind === "colour" ? style().colour : style().highlight) || null}
                onChange={(value: string | null) =>
                  apply(() => (kind === "colour" ? $setTextColour(value) : $setHighlight(value)))
                }
              />
            </>
          )}
        </For>
      </PopoverContent>
    </Popover>
  );
}

export interface TextSizeMenuProps extends Customisable<FormatMenuSlots> {}

/** The selected text's size, small to huge, against the text around it. */
export function TextSizeMenu(props: TextSizeMenuProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const style = useLexicalEditorState($selectionStyle);
  function cls(): FormatMenuSlots {
    return parts(formatMenuStyles(), props.classes);
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          size="sm"
          class={arc(cls().trigger, props.class, props.className)}
          aria-label={messages().textSize}
          title={messages().textSize}
          data-slot="text-size-trigger"
        >
          <ALargeSmall aria-hidden="true" />
          <ChevronDown class={cls().chevron} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={messages().textSize} align="start">
        <DropdownMenuRadioGroup
          value={style().size ?? "normal"}
          onValueChange={(value: string) => {
            editor.update(() => $setTextSize(value === "normal" ? null : (value as TextSize)));
            editor.focus();
          }}
        >
          <For each={SIZE_NAMES}>
            {(size: TextSize | "normal") => (
              <DropdownMenuRadioItem value={size}>
                <span
                  class={cls().sample}
                  style={size === "normal" ? undefined : { "font-size": TEXT_SIZES[size] }}
                >
                  {messages().textSizeName(size)}
                </span>
              </DropdownMenuRadioItem>
            )}
          </For>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Formatting past the marks: superscript (Mod+.) and subscript (Mod+,),
 * text colour and highlight from nine colours, three sizes, a yellow
 * highlight on Mod+Shift+H, strikethrough on Mod+Shift+S as well, and clear
 * formatting on Mod+\. The keys are taken by their place, so an Arabic
 * keyboard reaches them; colour and size are stored as the text's style,
 * which pasted text keeps too, and `RichTextRenderer` draws.
 */
export const formattingExtension = defineEditorExtension({
  name: "arc/formatting",
  lexical: [StyledHtmlExtension],
  keys: [
    { keys: "Mod+.", run: (editor) => format(editor, "superscript") },
    { keys: "Mod+,", run: (editor) => format(editor, "subscript") },
    { keys: "Mod+Shift+s", run: (editor) => format(editor, "strikethrough") },
    { keys: "Mod+Shift+h", run: () => $setHighlight(HIGHLIGHT_COLOURS.yellow) },
    { keys: "Mod+\\", run: () => $clearFormatting() },
  ],
  floating: [
    {
      id: "superscript",
      label: (messages) => messages.superscript,
      icon: () => <Superscript />,
      shortcut: "Mod+.",
      $pressed: () => $hasFormat("superscript"),
      run: (editor) => format(editor, "superscript"),
    },
    {
      id: "subscript",
      label: (messages) => messages.subscript,
      icon: () => <Subscript />,
      shortcut: "Mod+,",
      $pressed: () => $hasFormat("subscript"),
      run: (editor) => format(editor, "subscript"),
    },
    {
      id: "text-colour",
      label: (messages) => messages.textColour,
      icon: () => <Baseline />,
      control: () => <TextColourMenu />,
    },
    {
      id: "text-size",
      label: (messages) => messages.textSize,
      icon: () => <ALargeSmall />,
      control: () => <TextSizeMenu />,
    },
    {
      id: "clear-formatting",
      label: (messages) => messages.clearFormatting,
      icon: () => <RemoveFormatting />,
      shortcut: "Mod+\\",
      run: (editor) => editor.update(() => $clearFormatting()),
    },
  ],
});
