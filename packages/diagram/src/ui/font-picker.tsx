import { For, Show, createMemo } from "@barqjs/core";
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
import { getBoundTextElement, isTextElement, newElementWith } from "@excalidraw/element";

import { actionChangeFontFamily } from "../editor/actions/text.ts";
import { getFormValue } from "../editor/actions/properties.ts";
import { Fonts } from "../fonts/fonts.ts";
import { closesOnPressOutside } from "./color-picker.tsx";
import { useDiagramUI } from "./context.tsx";
import { layout, rounded, space } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { iconButton, radioChoice, radioGroupRow } from "./styles.ts";
import { TopPicksMenu, TopPicksTip, createTopPicksDnD } from "./top-picks.tsx";

import type { ExcalidrawElement, FontFamilyValues } from "@excalidraw/element/types";
import type { TranslationKey } from "../i18n.ts";

interface DefaultFont {
  value: FontFamilyValues;
  label: TranslationKey;
  testId: string;
}

/** The three fonts Excalidraw offers beside its list. */
const DEFAULT_FONTS: readonly DefaultFont[] = [
  { value: FONT_FAMILY.Excalifont, label: "labels.handDrawn", testId: "font-family-hand-drawn" },
  { value: FONT_FAMILY.Nunito, label: "labels.normal", testId: "font-family-normal" },
  { value: FONT_FAMILY["Comic Shanns"], label: "labels.code", testId: "font-family-code" },
];

function fontIcon(fontFamily: number) {
  return fontFamily === FONT_FAMILY["Comic Shanns"] || fontFamily === FONT_FAMILY.Cascadia
    ? Code
    : fontFamily === FONT_FAMILY.Excalifont || fontFamily === FONT_FAMILY.Virgil
      ? Pencil
      : Type;
}

/** A family's name as it is registered. */
export function getFontFamilyLabel(fontFamily: number): string {
  return Object.entries(FONT_FAMILY).find(([, id]) => id === fontFamily)?.[0] ?? "Unknown";
}

interface FontEntry {
  value: FontFamilyValues;
  label: string;
  deprecated: boolean;
}

const list = d({
  width: "220px",
  "& [cmdk-list], & [data-slot=command-list]": { maxHeight: "280px" },
});
const badge = d(layout.pushEnd, rounded.full, {
  paddingInline: space.x1_5,
  fontSize: "10px",
  backgroundColor: "var(--danger-subtle)",
  color: "var(--danger-foreground)",
});

export interface FontPickerProps {
  compact?: boolean;
}

interface FontLists {
  scene: FontEntry[];
  available: FontEntry[];
}

/**
 * Excalidraw's font picker: the three defaults as radios, and the other
 * fonts in a list searched by typing, the scene's own first.
 */
export function FontPicker(props: FontPickerProps = {}) {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  // open while the editor's `openPopup` names it, as Excalidraw's: Shift+F opens it there too
  function open(): boolean {
    return store.state("openPopup") === "fontFamily";
  }
  // the selection as it was when the list opened, which a hover previews on and a close restores
  let cached = new Map<string, ExcalidrawElement>();
  let picked = false;
  function setOpen(next: boolean): void {
    const editor = store.editor;
    if (next && !open() && editor) {
      cached = new Map();
      picked = false;
      const editing = editor.state.editingTextElement;
      const elements = editing
        ? [editor.scene.getElement(editing.id) ?? editing]
        : editor.scene.getSelectedElements({
            selectedElementIds: editor.state.selectedElementIds,
            includeBoundTextElement: true,
          });
      for (const element of elements) cached.set(element.id, newElementWith(element, {}, true));
    }
    if (!next && open() && editor && !picked) {
      ui.run(actionChangeFontFamily, {
        currentHoveredFontFamily: null,
        cachedElements: cached,
        resetAll: true,
      });
    }
    if (!editor || next === (editor.state.openPopup === "fontFamily")) return;
    editor.batch(() => editor.setState({ openPopup: next ? "fontFamily" : null }));
  }
  function hover(label: string): void {
    const font = [...fonts().scene, ...fonts().available].find((entry) => entry.label === label);
    if (!font || !open()) return;
    ui.run(actionChangeFontFamily, {
      currentHoveredFontFamily: font.value,
      cachedElements: cached,
      resetContainers: true,
    });
  }

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

  const fonts = createMemo((): FontLists => {
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
      available: all.filter(
        (font) => !inScene.has(font.value) && (ui.host().showDeprecatedFonts || !font.deprecated),
      ),
    };
  });

  function choose(fontFamily: FontFamilyValues): void {
    picked = true;
    setOpen(false);
    ui.run(actionChangeFontFamily, {
      currentItemFontFamily: fontFamily,
      currentHoveredFontFamily: null,
      openPopup: null,
    });
  }

  function customPicks(): readonly FontFamilyValues[] | null {
    const picks = store.state("fontTopPicks");
    return picks?.length ? picks : null;
  }
  function topPicks(): readonly FontFamilyValues[] {
    return customPicks() ?? DEFAULT_FONTS.map((font) => font.value);
  }
  function setTopPicks(picks: readonly FontFamilyValues[] | null): void {
    const editor = store.editor;
    editor?.batch(() => editor.setState({ fontTopPicks: picks }));
  }
  const dnd = createTopPicksDnD<FontFamilyValues>({
    enabled: () => true,
    picks: topPicks,
    onChange: setTopPicks,
  });
  function pickLabel(value: FontFamilyValues): string {
    const known = DEFAULT_FONTS.find((font) => font.value === value);
    return known ? t(known.label) : getFontFamilyLabel(value);
  }
  function pickTestId(value: FontFamilyValues): string {
    return (
      DEFAULT_FONTS.find((font) => font.value === value)?.testId ?? `font-family-pick-${value}`
    );
  }

  function isDefault() {
    return topPicks().some((value) => value === selected());
  }

  return (
    <div class={radioGroupRow}>
      <Show when={props.compact !== true}>
        <TopPicksMenu
          customizable
          customized={customPicks() !== null}
          resetLabel={t("fontList.resetTopPicks")}
          onReset={() => setTopPicks(null)}
        >
          <div class={radioGroupRow} ref={(element: HTMLDivElement) => dnd.setStrip(element)}>
            <RadioGroup
              aria-label={t("labels.fontFamily")}
              value={isDefault() ? String(selected()) : null}
              orientation="horizontal"
              onChange={(value: string) => ui.run(actionChangeFontFamily, Number(value))}
              class={radioGroupRow}
            >
              <For each={topPicks()}>
                {(value: FontFamilyValues, index: () => number) => {
                  const Icon = fontIcon(value);
                  return (
                    <Radio
                      value={String(value)}
                      aria-label={pickLabel(value)}
                      elementType="span"
                      class={radioChoice}
                      data-testid={pickTestId(value)}
                    >
                      <span
                        title={pickLabel(value)}
                        onPointerDown={dnd.onPointerDown(value, index())}
                        data-top-pick-index={index()}
                        data-drop-target={dnd.dragging()?.overIndex === index() ? "" : undefined}
                        data-duplicate={dnd.dragging()?.duplicateIndex === index() ? "" : undefined}
                      >
                        <Icon aria-hidden="true" />
                      </span>
                    </Radio>
                  );
                }}
              </For>
            </RadioGroup>
          </div>
        </TopPicksMenu>
      </Show>
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="icon"
            class={iconButton}
            aria-label={`${t("labels.fontFamily")}: ${selected() === null ? "" : getFontFamilyLabel(selected()!)}`}
            title={props.compact === true ? t("labels.showFonts") : t("labels.fontFamily")}
            data-active={!isDefault() && selected() !== null ? "" : undefined}
            data-properties-trigger={props.compact === true ? "" : undefined}
            data-testid="font-family-show-fonts"
          >
            <Show when={props.compact === true} fallback={<span aria-hidden="true">…</span>}>
              <Type aria-hidden="true" />
            </Show>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side={props.compact === true ? "right" : "bottom"}
          align="start"
          shouldCloseOnInteractOutside={props.compact === true ? closesOnPressOutside : undefined}
        >
          <Command label={t("labels.fontFamily")} class={list} loop onValueChange={hover}>
            <CommandInput placeholder={t("quickSearch.placeholder")} />
            <CommandList>
              <CommandEmpty>{t("fontList.empty")}</CommandEmpty>
              <Show when={fonts().scene.length > 0}>
                <CommandGroup heading={t("fontList.sceneFonts")}>
                  <For each={fonts().scene}>
                    {(font: FontEntry) => (
                      <FontItem
                        font={font}
                        selected={selected()}
                        onSelect={choose}
                        onDragStart={dnd.onPointerDown(font.value)}
                      />
                    )}
                  </For>
                </CommandGroup>
              </Show>
              <CommandGroup heading={t("fontList.availableFonts")}>
                <For each={fonts().available}>
                  {(font: FontEntry) => (
                    <FontItem
                      font={font}
                      selected={selected()}
                      onSelect={choose}
                      onDragStart={dnd.onPointerDown(font.value)}
                    />
                  )}
                </For>
              </CommandGroup>
            </CommandList>
          </Command>
          <TopPicksTip
            tip={t("fontList.topPicksTip")}
            resetLabel={t("buttons.reset")}
            onReset={customPicks() ? () => setTopPicks(null) : undefined}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface FontItemProps {
  font: FontEntry;
  selected: FontFamilyValues | null;
  onSelect: (font: FontFamilyValues) => void;
  onDragStart: (event: PointerEvent) => void;
}

function FontItem(props: FontItemProps) {
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
      <span
        style={{ fontFamily: getFontFamilyString({ fontFamily: props.font.value }) }}
        onPointerDown={(event: PointerEvent) => props.onDragStart(event)}
      >
        {props.font.label}
      </span>
      <Show when={props.font.deprecated}>
        <span class={badge}>{ui.t("fontList.badge.old")}</span>
      </Show>
    </CommandItem>
  );
}
