import { For, Show, createMemo, createSignal } from "@barqjs/core";
import { Pipette } from "@barqjs/lucide/icons/pipette";
import { Button } from "@barqjs/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import {
  COLORS_PER_ROW,
  COLOR_PALETTE,
  KEYS,
  MAX_CUSTOM_COLORS_USED_IN_CANVAS,
  isTransparent,
  normalizeInputColor,
} from "@excalidraw/common";

import { useDiagramUI } from "./context.tsx";
import { previewColorOnSelection } from "./editor-keys.tsx";
import { startEyeDropper } from "./eye-dropper.ts";
import { diagramLayer as d } from "./layer.ts";
import { iconButton, swatch, swatchFill, textInput } from "./styles.ts";

import type { ColorPaletteCustom, ColorTuple } from "@excalidraw/common";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { TranslationKey } from "../i18n.ts";

export type ColorPickerType = "canvasBackground" | "elementBackground" | "elementStroke";

type Section = "custom" | "baseColors" | "shades" | "hex";

/** The palette's keys, row by row: `q` picks its first colour, as in Excalidraw. */
export const COLOR_HOTKEYS = [
  ["q", "w", "e", "r", "t"],
  ["a", "s", "d", "f", "g"],
  ["z", "x", "c", "v", "b"],
].flat();

/** Which palette colour and shade a value is, or `null` for a custom one. */
export const getColorNameAndShade = (
  palette: ColorPaletteCustom,
  color: string | null,
): { colorName: string; shade: number | null } | null => {
  if (!color) return null;
  for (const [colorName, value] of Object.entries(palette)) {
    if (Array.isArray(value)) {
      const shade = value.indexOf(color);
      if (shade > -1) return { colorName, shade };
    } else if (value === color) {
      return { colorName, shade: null };
    }
  }
  return null;
};

/** A palette colour's shade, or nothing for a colour that has none. */
const shadeOf = (value: ColorTuple | string | undefined, index: number): string | undefined =>
  typeof value === "string" || value === undefined ? undefined : value[index];

const isCustomColor = (color: string, palette: ColorPaletteCustom): boolean =>
  !Object.values(palette).flat().includes(color);

/** The custom colours the scene uses most, five at most. */
export const getMostUsedCustomColors = (
  elements: readonly ExcalidrawElement[],
  type: "elementBackground" | "elementStroke",
  palette: ColorPaletteCustom,
): string[] => {
  const key = type === "elementBackground" ? "backgroundColor" : "strokeColor";
  const counts = new Map<string, number>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    const color = element[key];
    if (isTransparent(color) || !isCustomColor(color, palette)) continue;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .slice(0, MAX_CUSTOM_COLORS_USED_IN_CANVAS);
};

/** An arrow key's next index in a grid five wide. */
const arrowIndex = (key: string, current: number | null, length: number): number | undefined => {
  const rows = Math.ceil(length / COLORS_PER_ROW);
  const index = current ?? -1;
  switch (key) {
    case KEYS.ARROW_LEFT:
      return index - 1 < 0 ? length - 1 : index - 1;
    case KEYS.ARROW_RIGHT:
      return (index + 1) % length;
    case KEYS.ARROW_DOWN: {
      const next = index + COLORS_PER_ROW;
      return next >= length ? index % COLORS_PER_ROW : next;
    }
    case KEYS.ARROW_UP: {
      const previous = index - COLORS_PER_ROW;
      const next = previous < 0 ? COLORS_PER_ROW * rows + previous : previous;
      return next >= length ? undefined : next;
    }
    default:
      return undefined;
  }
};

const row = d({ display: "flex", flexWrap: "wrap", gap: "6px" });
const grid = d({
  display: "grid",
  gridTemplateColumns: "repeat(5, 24px)",
  gap: "6px",
});
const heading = d({
  fontSize: "var(--text-xs, 0.75rem)",
  color: "var(--muted-foreground, GrayText)",
  marginBlock: "6px 4px",
});
const content = d({
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  width: "196px",
  padding: "12px",
  outline: "none",
});
const hotkey = d({
  position: "absolute",
  insetInlineEnd: "1px",
  bottom: "0",
  fontSize: "8px",
  lineHeight: "1",
  pointerEvents: "none",
});
const hexRow = d({ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" });
const hexPrefix = d({ color: "var(--muted-foreground, GrayText)" });
const pickerRow = d({ display: "flex", alignItems: "center", gap: "6px" });
const swatchDivider = d({
  width: "1px",
  height: "20px",
  backgroundColor: "var(--border, rgb(0 0 0 / 0.12))",
});

export interface ColorPickerProps {
  type: ColorPickerType;
  /** The current colour; `null` when the selection mixes several. */
  color: string | null;
  onChange: (color: string) => void;
  label: string;
  /** The five quick picks shown beside the trigger. */
  topPicks: ColorTuple;
  /** `null` offers only the quick picks and a hex code, as the canvas background does. */
  palette: ColorPaletteCustom | null;
  /** Colours left out of the palette without moving the others' keys. */
  excludedColors?: readonly string[];
  /** The scene, for the custom colours it uses most. */
  elements?: readonly ExcalidrawElement[];
  "data-testid"?: string;
}

/**
 * Excalidraw's colour picker: the quick picks, and a popover with the custom
 * colours the scene uses, the palette, the shades of the colour, a hex code
 * and the eye dropper. In the popover the arrows move within a section, Tab
 * between sections, a letter picks a palette colour, Shift with a digit a
 * shade, a digit a custom colour, `i` the eye dropper and Escape closes.
 */
export function ColorPicker(props: ColorPickerProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [ownOpen, setOwnOpen] = createSignal(false);
  // the command palette opens a picker through the editor's `openPopup`
  const open = (): boolean => ownOpen() || ui.store.state("openPopup") === props.type;
  const setOpen = (next: boolean): void => {
    setOwnOpen(next);
    const editor = ui.store.editor;
    if (!next && editor?.state.openPopup === props.type) {
      editor.batch(() => editor.setState({ openPopup: null }));
    }
  };
  const [section, setSection] = createSignal<Section | null>(null);
  let contentElement: HTMLDivElement | undefined;

  const colorName = (color: string): string => {
    if (isTransparent(color)) return t("colors.transparent");
    const found = props.palette ? getColorNameAndShade(props.palette, color) : null;
    if (!found) return color;
    const name = t(`colors.${found.colorName}` as TranslationKey);
    return found.shade === null ? name : `${name} ${found.shade + 1}`;
  };

  const customColors = createMemo((): string[] =>
    props.palette && props.type !== "canvasBackground" && props.elements
      ? getMostUsedCustomColors(props.elements, props.type, props.palette)
      : [],
  );
  const current = createMemo(() =>
    props.palette ? getColorNameAndShade(props.palette, props.color) : null,
  );
  const activeShade = (): number => current()?.shade ?? 3;
  const isExcluded = (color: string): boolean => props.excludedColors?.includes(color) ?? false;

  const paletteEntries = createMemo((): { name: string; color: string; index: number }[] =>
    Object.entries(props.palette ?? {}).map(([name, value], index) => ({
      name,
      index,
      color: Array.isArray(value) ? (value[activeShade()] ?? value[0] ?? "") : (value as string),
    })),
  );
  const shades = (): readonly string[] => {
    const found = current();
    const value = found && props.palette ? props.palette[found.colorName] : undefined;
    return Array.isArray(value) ? value : [];
  };

  const pick = (color: string, from: Section): void => {
    setSection(from);
    props.onChange(color);
    queueMicrotask(() => focusActive());
  };

  const focusActive = (): void => {
    const active = contentElement?.querySelector<HTMLElement>(
      `[data-section="${section() ?? "baseColors"}"] [data-active]`,
    );
    active?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event[KEYS.CTRL_OR_CMD] || (event.target as HTMLElement).tagName === "INPUT") {
      if (event.key === KEYS.ESCAPE) setOpen(false);
      return;
    }
    const handled = handleKey(event);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleKey = (event: KeyboardEvent): boolean => {
    const palette = props.palette;
    if (event.key === KEYS.ESCAPE) {
      setOpen(false);
      return true;
    }
    if (event.key === KEYS.I) {
      eyeDropper();
      return true;
    }
    // held, Alt picks with the eye dropper until it is let go
    if (event.key === KEYS.ALT && !event.repeat) {
      eyeDropper(true);
      return true;
    }
    if (!palette) return false;
    const found = current();
    if (event.key === KEYS.TAB) {
      const sections = (["custom", "baseColors", "shades", "hex"] as const).filter(
        (each) =>
          (each !== "custom" || customColors().length > 0) &&
          (each !== "shades" || (found !== null && found.shade !== null)),
      );
      const index = sections.findIndex((each) => each === (section() ?? "baseColors"));
      const next =
        sections[(index + (event.shiftKey ? -1 : 1) + sections.length) % sections.length] ??
        "baseColors";
      setSection(next);
      if (next === "custom" && customColors()[0]) props.onChange(customColors()[0]!);
      if (next === "baseColors" && !found) props.onChange(COLOR_PALETTE.black);
      queueMicrotask(() => {
        if (next === "hex") {
          contentElement?.querySelector<HTMLInputElement>("input")?.focus();
        } else {
          focusActive();
        }
      });
      return true;
    }
    if (found && found.shade !== null && /^Digit[1-5]$/.test(event.code) && event.shiftKey) {
      const shade = shadeOf(palette[found.colorName], Number(event.code.slice(-1)) - 1);
      if (shade) pick(shade, "shades");
      return true;
    }
    if (/^[1-5]$/.test(event.key)) {
      const custom = customColors()[Number(event.key) - 1];
      if (custom) pick(custom, "custom");
      return custom !== undefined;
    }
    const hotkeyIndex = COLOR_HOTKEYS.indexOf(event.key);
    if (hotkeyIndex > -1) {
      const entry = paletteEntries()[hotkeyIndex];
      if (entry && !isExcluded(entry.color)) pick(entry.color, "baseColors");
      return true;
    }
    const where = section() ?? "baseColors";
    if (where === "shades" && found && found.shade !== null) {
      const next = arrowIndex(event.key, found.shade, COLORS_PER_ROW);
      const shade = next === undefined ? undefined : shadeOf(palette[found.colorName], next);
      if (shade) {
        pick(shade, "shades");
        return true;
      }
    }
    if (where === "baseColors") {
      const entries = paletteEntries();
      const index = entries.findIndex((entry) => entry.name === found?.colorName);
      let next = arrowIndex(event.key, index === -1 ? null : index, entries.length);
      // over hidden colours, in the arrow's direction
      for (let guard = 0; next !== undefined && guard < entries.length; guard++) {
        if (!isExcluded(entries[next]?.color ?? "")) break;
        next = arrowIndex(event.key, next, entries.length);
      }
      const entry = next === undefined ? undefined : entries[next];
      if (entry) {
        pick(entry.color, "baseColors");
        return true;
      }
    }
    if (where === "custom") {
      const colors = customColors();
      const index = props.color === null ? 0 : colors.indexOf(props.color);
      const next = arrowIndex(event.key, index, colors.length);
      const color = next === undefined ? undefined : colors[next];
      if (color) {
        pick(color, "custom");
        return true;
      }
    }
    return false;
  };

  const eyeDropper = (keepOpenOnAlt = false): void => {
    const editor = ui.store.editor;
    if (!editor) return;
    setOpen(false);
    const property =
      props.type === "elementStroke"
        ? "strokeColor"
        : props.type === "elementBackground"
          ? "backgroundColor"
          : null;
    startEyeDropper(editor, {
      keepOpenOnAlt,
      onChange: property ? (color) => previewColorOnSelection(editor, property, color) : undefined,
      onSelect: (color) => props.onChange(color),
    });
  };

  return (
    <div class={pickerRow} data-testid={props["data-testid"]}>
      <div class={row} role="group" aria-label={props.label}>
        <For each={props.topPicks.filter((color) => !isExcluded(color))}>
          {(color: string) => (
            <button
              type="button"
              class={swatch}
              aria-label={colorName(color)}
              aria-pressed={props.color === color}
              title={colorName(color)}
              onClick={() => props.onChange(color)}
              data-testid={`color-top-pick-${color}`}
            >
              <span class={swatchFill} style={{ background: color }} />
            </button>
          )}
        </For>
      </div>
      <div class={swatchDivider} aria-hidden="true" />
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="icon"
            class={swatch}
            aria-label={`${props.label}: ${props.color === null ? "" : colorName(props.color)}`}
            aria-haspopup="dialog"
            title={props.label}
            data-testid={`${props.type}-picker-trigger`}
          >
            <span class={swatchFill} style={{ background: props.color ?? "transparent" }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start">
          <div
            ref={(element: HTMLDivElement) => {
              contentElement = element;
              queueMicrotask(() => focusActive());
            }}
            class={content}
            role="dialog"
            aria-label={t("labels.colorPicker")}
            onKeyDown={onKeyDown}
            data-testid="color-picker-content"
          >
            <Show when={customColors().length > 0}>
              <div class={heading}>{t("colorPicker.mostUsedCustomColors")}</div>
              <div
                class={row}
                data-section="custom"
                role="group"
                aria-label={t("colorPicker.mostUsedCustomColors")}
              >
                <For each={customColors()}>
                  {(color: string, index: () => number) => (
                    <SwatchButton
                      color={color}
                      name={colorName(color)}
                      active={props.color === color}
                      hint={String(index() + 1)}
                      onPick={() => pick(color, "custom")}
                    />
                  )}
                </For>
              </div>
            </Show>
            <Show when={props.palette !== null}>
              <div class={heading}>{t("colorPicker.colors")}</div>
              <div
                class={grid}
                data-section="baseColors"
                role="group"
                aria-label={t("colorPicker.colors")}
              >
                <For each={paletteEntries()}>
                  {(entry: { name: string; color: string; index: number }) => (
                    <Show when={!isExcluded(entry.color)} fallback={<span />}>
                      <SwatchButton
                        color={entry.color}
                        name={t(`colors.${entry.name}` as TranslationKey)}
                        active={current()?.colorName === entry.name}
                        hint={COLOR_HOTKEYS[entry.index] ?? ""}
                        onPick={() => pick(entry.color, "baseColors")}
                      />
                    </Show>
                  )}
                </For>
              </div>
              <div class={heading}>{t("colorPicker.shades")}</div>
              <Show
                when={shades().length > 0}
                fallback={<div class={heading}>{t("colorPicker.noShades")}</div>}
              >
                <div
                  class={row}
                  data-section="shades"
                  role="group"
                  aria-label={t("colorPicker.shades")}
                >
                  <For each={shades()}>
                    {(color: string, index: () => number) => (
                      <SwatchButton
                        color={color}
                        name={colorName(color)}
                        active={props.color === color}
                        hint={String(index() + 1)}
                        onPick={() => pick(color, "shades")}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>
            <div class={heading}>{t("colorPicker.hexCode")}</div>
            <HexInput
              color={props.color}
              onChange={(color) => props.onChange(color)}
              onEyeDropper={eyeDropper}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SwatchButton(props: {
  color: string;
  name: string;
  active: boolean;
  hint: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      class={swatch}
      aria-label={props.name}
      aria-pressed={props.active}
      title={props.name}
      tabIndex={props.active ? 0 : -1}
      data-active={props.active ? "" : undefined}
      onClick={() => props.onPick()}
      data-testid={`color-${props.color}`}
    >
      <span class={swatchFill} style={{ background: props.color }} />
      <span
        class={hotkey}
        aria-hidden="true"
        style={{
          color: isTransparent(props.color) ? "currentColor" : "white",
          mixBlendMode: "difference",
        }}
      >
        {props.hint}
      </span>
    </button>
  );
}

function HexInput(props: {
  color: string | null;
  onChange: (color: string) => void;
  onEyeDropper: () => void;
}) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [error, setError] = createSignal<string | null>(null);
  const shown = (): string => (props.color ?? "").replace(/^#/, "");
  const commit = (value: string): void => {
    const trimmed = value.trim().replace(/^#/, "");
    const normalized = normalizeInputColor(/^[0-9a-f]+$/i.test(trimmed) ? `#${trimmed}` : trimmed);
    if (normalized) {
      setError(null);
      props.onChange(normalized);
    } else if (/^[0-9a-f]+$/i.test(trimmed) && ![3, 4, 6, 8].includes(trimmed.length)) {
      setError(t("colorPicker.invalidHexLength"));
    } else {
      setError(t("colorPicker.invalidColor"));
    }
  };
  return (
    <div data-section="hex">
      <div class={hexRow}>
        <span class={hexPrefix} aria-hidden="true">
          #
        </span>
        <input
          class={textInput}
          value={shown()}
          spellcheck={false}
          aria-label={t("colorPicker.hexCode")}
          placeholder={t("colorPicker.color")}
          aria-invalid={error() !== null}
          onChange={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === KEYS.ENTER) commit(event.currentTarget.value);
          }}
          data-testid="color-hex-input"
        />
        <button
          type="button"
          class={iconButton}
          aria-label={t("labels.eyeDropper")}
          title={`${t("labels.eyeDropper")} — I`}
          aria-keyshortcuts="I"
          onClick={() => props.onEyeDropper()}
          data-testid="eye-dropper"
        >
          <Pipette aria-hidden="true" />
        </button>
      </div>
      <Show when={error()}>
        <div role="alert" class={heading}>
          {error()}
        </div>
      </Show>
    </div>
  );
}
