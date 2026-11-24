import { For, Show, createMemo, createSignal } from "@barqjs/core";
import { Radio, RadioGroup } from "@barqjs/aria/radio";
import { Code } from "@barqjs/lucide/icons/code";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Type } from "@barqjs/lucide/icons/type";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@barqjs/ui/command";
import { Button } from "@barqjs/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { FONT_FAMILY, getFontFamilyString } from "@excalidraw/common";
import { getBoundTextElement, isTextElement } from "@excalidraw/element";

import { actionChangeFontFamily } from "../editor/actions/text.ts";
import { getFormValue } from "../editor/actions/properties.ts";
import { Fonts } from "../fonts/fonts.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, radioChoice, radioGroupRow } from "./styles.ts";

import type { FontFamilyValues } from "@excalidraw/element/types";
import type { TranslationKey } from "../i18n.ts";

/** The three fonts Excalidraw offers beside its list. */
const DEFAULT_FONTS: readonly { value: FontFamilyValues; label: TranslationKey; testId: string }[] =
  [
    { value: FONT_FAMILY.Excalifont, label: "labels.handDrawn", testId: "font-family-hand-drawn" },
    { value: FONT_FAMILY.Nunito, label: "labels.normal", testId: "font-family-normal" },
    { value: FONT_FAMILY["Comic Shanns"], label: "labels.code", testId: "font-family-code" },
  ];

const fontIcon = (fontFamily: number) =>
  fontFamily === FONT_FAMILY["Comic Shanns"] || fontFamily === FONT_FAMILY.Cascadia
    ? Code
    : fontFamily === FONT_FAMILY.Excalifont || fontFamily === FONT_FAMILY.Virgil
      ? Pencil
      : Type;

/** A family's name as it is registered. */
export const getFontFamilyLabel = (fontFamily: number): string =>
  Object.entries(FONT_FAMILY).find(([, id]) => id === fontFamily)?.[0] ?? "Unknown";

interface FontEntry {
  value: FontFamilyValues;
  label: string;
  deprecated: boolean;
}

const list = d({
  width: "220px",
  "& [cmdk-list], & [data-slot=command-list]": { maxHeight: "280px" },
});
const badge = d({
  marginInlineStart: "auto",
  paddingInline: "6px",
  borderRadius: "9999px",
  fontSize: "10px",
  backgroundColor: "var(--danger-subtle, #ffe3e3)",
  color: "var(--danger-foreground, #c92a2a)",
});

/**
 * Excalidraw's font picker: the three defaults as radios, and the other
 * fonts in a list searched by typing, the scene's own first.
 */
export function FontPicker() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const [open, setOpen] = createSignal(false);

  const selected = createMemo((): FontFamilyValues | null => {
    store.selection();
    const fallback = store.state("currentItemFontFamily");
    const editor = store.editor;
    if (!editor) return fallback;
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    return getFormValue<FontFamilyValues | null>(
      editor.scene.getElementsIncludingDeleted(),
      editor,
      (element) => {
        if (isTextElement(element)) return element.fontFamily;
        return getBoundTextElement(element, elementsMap)?.fontFamily ?? null;
      },
      (element) => isTextElement(element) || getBoundTextElement(element, elementsMap) !== null,
      (hasSelection) => (hasSelection ? null : fallback),
    );
  });

  const fonts = createMemo((): { scene: FontEntry[]; available: FontEntry[] } => {
    // the scene's families when the list opens
    open();
    const all: FontEntry[] = [...Fonts.registered.entries()]
      .filter(([, { metadata }]) => !metadata.private && !metadata.fallback)
      .map(([id, { metadata }]) => ({
        value: id,
        label: getFontFamilyLabel(id),
        deprecated: metadata.deprecated === true,
      }))
      .toSorted((a, b) => (a.label.toLowerCase() > b.label.toLowerCase() ? 1 : -1));
    const inScene = new Set(store.editor?.fonts.getSceneFamilies() ?? []);
    return {
      scene: all.filter((font) => inScene.has(font.value)),
      available: all.filter((font) => !inScene.has(font.value) && !font.deprecated),
    };
  });

  const choose = (fontFamily: FontFamilyValues): void => {
    setOpen(false);
    ui.run(actionChangeFontFamily, fontFamily);
  };

  const isDefault = () => DEFAULT_FONTS.some((font) => font.value === selected());

  return (
    <div class={radioGroupRow}>
      <RadioGroup
        aria-label={t("labels.fontFamily")}
        value={isDefault() ? String(selected()) : null}
        orientation="horizontal"
        onChange={(value: string) => ui.run(actionChangeFontFamily, Number(value))}
        class={radioGroupRow}
      >
        <For each={DEFAULT_FONTS}>
          {(font: (typeof DEFAULT_FONTS)[number]) => {
            const Icon = fontIcon(font.value);
            return (
              <Radio
                value={String(font.value)}
                aria-label={t(font.label)}
                elementType="span"
                class={radioChoice}
                data-testid={font.testId}
              >
                <span title={t(font.label)}>
                  <Icon aria-hidden="true" />
                </span>
              </Radio>
            );
          }}
        </For>
      </RadioGroup>
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="icon"
            class={iconButton}
            aria-label={`${t("labels.fontFamily")}: ${selected() === null ? "" : getFontFamilyLabel(selected()!)}`}
            title={t("labels.fontFamily")}
            data-active={!isDefault() && selected() !== null ? "" : undefined}
            data-testid="font-family-show-fonts"
          >
            <span aria-hidden="true">…</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start">
          <Command label={t("labels.fontFamily")} class={list} loop>
            <CommandInput placeholder={t("quickSearch.placeholder")} />
            <CommandList>
              <CommandEmpty>{t("fontList.empty")}</CommandEmpty>
              <Show when={fonts().scene.length > 0}>
                <CommandGroup heading={t("fontList.sceneFonts")}>
                  <For each={fonts().scene}>
                    {(font: FontEntry) => (
                      <FontItem font={font} selected={selected()} onSelect={choose} />
                    )}
                  </For>
                </CommandGroup>
              </Show>
              <CommandGroup heading={t("fontList.availableFonts")}>
                <For each={fonts().available}>
                  {(font: FontEntry) => (
                    <FontItem font={font} selected={selected()} onSelect={choose} />
                  )}
                </For>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FontItem(props: {
  font: FontEntry;
  selected: FontFamilyValues | null;
  onSelect: (font: FontFamilyValues) => void;
}) {
  const ui = useDiagramUI();
  const Icon = fontIcon(props.font.value);
  return (
    <CommandItem
      value={props.font.label}
      onSelect={() => props.onSelect(props.font.value)}
      data-selected-font={props.selected === props.font.value ? "" : undefined}
      aria-current={props.selected === props.font.value ? "true" : undefined}
      data-testid={`font-family-${props.font.value}`}
    >
      <Icon aria-hidden="true" />
      <span style={{ fontFamily: getFontFamilyString({ fontFamily: props.font.value }) }}>
        {props.font.label}
      </span>
      <Show when={props.font.deprecated}>
        <span class={badge}>{ui.t("fontList.badge.old")}</span>
      </Show>
    </CommandItem>
  );
}
