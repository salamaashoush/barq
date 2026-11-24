import { For, Show, createMemo, createSignal } from "@barqjs/core";
import type { HostSlots } from "./host-children.ts";
import { Toolbar as AriaToolbar } from "@barqjs/aria/toolbar";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Circle } from "@barqjs/lucide/icons/circle";
import { Diamond } from "@barqjs/lucide/icons/diamond";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Eraser } from "@barqjs/lucide/icons/eraser";
import { Frame } from "@barqjs/lucide/icons/frame";
import { Hand } from "@barqjs/lucide/icons/hand";
import { Image } from "@barqjs/lucide/icons/image";
import { Lasso } from "@barqjs/lucide/icons/lasso";
import { Lock } from "@barqjs/lucide/icons/lock";
import { LockOpen } from "@barqjs/lucide/icons/lock-open";
import { Minus } from "@barqjs/lucide/icons/minus";
import { MousePointer2 } from "@barqjs/lucide/icons/mouse-pointer-2";
import { PaintBucket } from "@barqjs/lucide/icons/paint-bucket";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Shapes } from "@barqjs/lucide/icons/shapes";
import { Square } from "@barqjs/lucide/icons/square";
import { StickyNote } from "@barqjs/lucide/icons/sticky-note";
import { Type } from "@barqjs/lucide/icons/type";
import { WandSparkles } from "@barqjs/lucide/icons/wand-sparkles";
import { Waypoints } from "@barqjs/lucide/icons/waypoints";
import { AppWindow } from "@barqjs/lucide/icons/app-window";
import { ScanText } from "@barqjs/lucide/icons/scan-text";
import { Zap } from "@barqjs/lucide/icons/zap";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Toggle } from "@barqjs/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";
import { capitalizeString } from "@excalidraw/common";

import { TOOLS } from "../editor/tools.ts";
import { ToolDrag } from "../editor/tool-drag.ts";
import { useDiagramUI } from "./context.tsx";
import {
  divider,
  iconButton,
  island,
  keyHint,
  menuItem,
  menuShortcut,
  menuSurface,
} from "./styles.ts";

import type { JSX } from "@barqjs/web";
import type { TranslationKey } from "../i18n.ts";
import type { ToolType } from "../types.ts";

type ToolIcon = (props: { "aria-hidden": "true" }) => JSX.Element;

const TOOL_ICONS: Record<string, ToolIcon> = {
  hand: Hand,
  selection: MousePointer2,
  lasso: Lasso,
  rectangle: Square,
  diamond: Diamond,
  ellipse: Circle,
  arrow: ArrowRight,
  line: Minus,
  freedraw: Pencil,
  text: Type,
  stickynote: StickyNote,
  eraser: Eraser,
  image: Image,
  frame: Frame,
  embeddable: AppWindow,
  laser: Zap,
  autoshape: Shapes,
  bucketfill: PaintBucket,
  magicframe: WandSparkles,
};

/** The toolbar's tools, in Excalidraw's order; the selection button is the lasso when that is preferred. */
const TOOLBAR_TOOLS = [
  "hand",
  "selection",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "stickynote",
  "eraser",
] as const;

interface ToolConfig {
  letterKey?: string | readonly string[];
  numericKey?: string;
  shiftKey?: boolean;
}

const configOf = (type: string): ToolConfig => (TOOLS as Record<string, ToolConfig>)[type] ?? {};

/** A tool's letter, as written on its button: `R`, or `Shift+X`. */
const toolLetter = (type: string, shiftName: string): string | undefined => {
  const { letterKey, shiftKey } = configOf(type);
  if (letterKey === undefined) return undefined;
  const letter = capitalizeString(typeof letterKey === "string" ? letterKey : (letterKey[0] ?? ""));
  return shiftKey === true ? `${shiftName}+${letter}` : letter;
};

/** The keys that pick a tool, for its tooltip and `aria-keyshortcuts`: `R or 2`. */
const toolShortcut = (type: string, or: string, shiftName: string): string => {
  const letter = toolLetter(type, shiftName);
  const { numericKey } = configOf(type);
  if (letter !== undefined && numericKey !== undefined) return `${letter} ${or} ${numericKey}`;
  return letter ?? numericKey ?? "";
};

const ariaShortcut = (type: string): string | undefined => {
  const { letterKey, numericKey, shiftKey } = configOf(type);
  const letters =
    letterKey === undefined ? [] : typeof letterKey === "string" ? [letterKey] : letterKey;
  const keys = [
    ...letters.map((letter) =>
      shiftKey === true ? `Shift+${letter.toUpperCase()}` : letter.toUpperCase(),
    ),
    ...(numericKey === undefined ? [] : [numericKey]),
  ];
  return keys.length > 0 ? keys.join(" ") : undefined;
};

function ToolGlyph(props: { type: string }) {
  const Icon = TOOL_ICONS[props.type] ?? Ellipsis;
  return <Icon aria-hidden="true" />;
}

/**
 * Excalidraw's toolbar: the tool lock, the hand, the drawing tools, and the
 * extra tools in a menu, each with its key on it. One tab stop, the arrows
 * moving through it; picking a tool hands the keyboard back to the canvas,
 * where Enter draws with it. A tool that can be dragged out (the sticky note)
 * drops where it is let go.
 */
export function Toolbar() {
  const ui = useDiagramUI();
  const t = ui.t;
  const activeTool = () => ui.store.state("activeTool");
  const preferredSelection = () => ui.store.state("preferredSelectionTool").type;

  const shownTools = createMemo((): readonly ToolType[] =>
    TOOLBAR_TOOLS.map((type) =>
      type === "selection" && preferredSelection() === "lasso" ? "lasso" : type,
    ),
  );
  const pressed = (): string => {
    const type = activeTool().type;
    return (shownTools() as readonly string[]).includes(type) ? type : "";
  };

  const select = (type: ToolType): void => {
    const editor = ui.store.editor;
    if (!editor) return;
    if (editor.state.activeTool.type !== type) {
      editor.batch(() => editor.setActiveTool({ type }));
    }
    ui.focusCanvas();
  };

  const label = (type: string): string => capitalizeString(t(`toolBar.${type}` as TranslationKey));

  return (
    <AriaToolbar aria-label={t("headings.shapes")} class={island} data-testid="toolbar">
      <Toggle
        class={iconButton}
        isSelected={activeTool().locked}
        onChange={() => {
          const editor = ui.store.editor;
          editor?.batch(() => editor.toggleLock());
        }}
        aria-label={t("toolBar.lock")}
        title={`${t("toolBar.lock")} — Q`}
        aria-keyshortcuts="Q"
        data-testid="toolbar-lock"
      >
        <Show when={activeTool().locked} fallback={<LockOpen aria-hidden="true" />}>
          <Lock aria-hidden="true" />
        </Show>
      </Toggle>
      <div class={divider} role="separator" aria-orientation="vertical" />
      <ToggleGroup
        type="single"
        spacing={1}
        value={pressed()}
        onValueChange={(value) => {
          if (typeof value === "string" && value !== "") select(value as ToolType);
        }}
        aria-label={t("headings.shapes")}
      >
        <For each={shownTools()}>
          {(type: ToolType) => {
            const shortcut = (): string => toolShortcut(type, t("helpDialog.or"), t("keys.shift"));
            return (
              <ToggleGroupItem
                value={type}
                class={iconButton}
                aria-label={label(type)}
                title={shortcut() ? `${label(type)} — ${shortcut()}` : label(type)}
                // the toggle forwards no `aria-keyshortcuts`; the keys never change
                ref={(element: HTMLButtonElement) => {
                  const keys = ariaShortcut(type);
                  if (keys) element.setAttribute("aria-keyshortcuts", keys);
                }}
                data-testid={`toolbar-${type}`}
                onPointerDown={(event: PointerEvent) => {
                  if (ToolDrag.isDraggable(type)) {
                    ui.store.editor?.toolDrag.handleButtonPointerDown(type, event);
                  }
                }}
              >
                <ToolGlyph type={type} />
                <Show when={type !== "hand"}>
                  <span class={keyHint} aria-hidden="true">
                    {toolLetter(type, t("keys.shift")) ?? configOf(type).numericKey}
                  </span>
                </Show>
              </ToggleGroupItem>
            );
          }}
        </For>
      </ToggleGroup>
      <div class={divider} role="separator" aria-orientation="vertical" />
      <ExtraTools select={select} label={label} />
    </AriaToolbar>
  );
}

const EXTRA_TOOLS = [
  "image",
  "frame",
  "embeddable",
  "autoshape",
  "laser",
  "bucketfill",
  "lasso",
] as const;

function ExtraTools(props: {
  select: (type: ToolType) => void;
  label: (type: string) => string;
  /** Tools the bar has no room for, listed first. */
  more?: readonly string[];
}) {
  const ui = useDiagramUI();
  const t = ui.t;
  const activeTool = () => ui.store.state("activeTool").type;
  const preferredSelection = () => ui.store.state("preferredSelectionTool").type;

  const tools = (): readonly string[] =>
    [...(props.more ?? []), ...EXTRA_TOOLS].filter(
      (type) =>
        (type !== "image" || ui.host().UIOptions.tools.image) &&
        (type !== "lasso" || preferredSelection() !== "lasso"),
    );
  /** The extra tool in use, which the trigger shows instead of its dots. */
  const selected = (): string | null => {
    const type = activeTool();
    if (type === "lasso" && preferredSelection() === "lasso") return null;
    // while collaborating the laser has its own button beside the toolbar
    if (type === "laser" && ui.host().isCollaborating) return null;
    return [...(props.more ?? []), ...EXTRA_TOOLS].includes(type) ? type : null;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          size="icon"
          class={iconButton}
          aria-label={t("toolBar.extraTools")}
          title={t("toolBar.extraTools")}
          data-active={selected() === null ? undefined : ""}
          data-testid="toolbar-extra-tools"
        >
          <ToolGlyph type={selected() ?? "more"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        class={menuSurface}
        aria-label={t("toolBar.extraTools")}
        onAction={(key) => {
          const type = String(key);
          if (type === "mermaid") {
            ui.store.editor?.batch(() =>
              ui.store.editor?.setState({ openDialog: { name: "ttd", tab: "mermaid" } }),
            );
          } else if (type === "magicframe") {
            const editor = ui.store.editor;
            editor?.batch(() => editor.magicFrame.onToolSelect());
          } else if (type === "textToDiagram") {
            ui.store.editor?.batch(() =>
              ui.store.editor?.setState({ openDialog: { name: "ttd", tab: "text-to-diagram" } }),
            );
          } else {
            props.select(type as ToolType);
          }
        }}
      >
        <For each={tools()}>
          {(type: string) => (
            <DropdownMenuItem
              id={type}
              class={menuItem}
              data-selected={selected() === type ? "" : undefined}
              data-testid={`toolbar-${type}`}
            >
              <ToolGlyph type={type} />
              <span>{props.label(type)}</span>
              <kbd class={menuShortcut}>
                {toolLetter(type, t("keys.shift")) ?? configOf(type).numericKey ?? ""}
              </kbd>
            </DropdownMenuItem>
          )}
        </For>
        <DropdownMenuSeparator />
        <Show when={ui.host().aiEnabled && ui.host().slots.ttdDialogTrigger} keyed>
          {(trigger: HostSlots["ttdDialogTrigger"]) => (
            <DropdownMenuItem
              id="textToDiagram"
              class={menuItem}
              data-testid="toolbar-textToDiagram"
            >
              {trigger.icon ?? <ScanText aria-hidden="true" />}
              <span>{trigger.children ?? t("labels.textToDiagram")}</span>
            </DropdownMenuItem>
          )}
        </Show>
        <DropdownMenuItem id="mermaid" class={menuItem} data-testid="toolbar-mermaid">
          <Waypoints aria-hidden="true" />
          <span>{t("toolBar.mermaidToExcalidraw")}</span>
        </DropdownMenuItem>
        <Show when={ui.host().aiEnabled && ui.host().diagramToCode}>
          <DropdownMenuItem id="magicframe" class={menuItem} data-testid="toolbar-magicframe">
            <WandSparkles aria-hidden="true" />
            <span>{t("toolBar.magicframe")}</span>
          </DropdownMenuItem>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PHONE_SHAPES = ["rectangle", "diamond", "ellipse"] as const;
const PHONE_LINEAR = ["arrow", "line"] as const;

/**
 * The toolbar along the bottom of a phone, Excalidraw's `MobileToolbar`: the
 * hand, the selection, drawing, the eraser, the last shape and the last line
 * used, text, and the rest in the extra tools' menu, each a finger's size.
 */
export function PhoneToolbar() {
  const ui = useDiagramUI();
  const t = ui.t;
  const activeTool = () => ui.store.state("activeTool");
  const preferredSelection = () => ui.store.state("preferredSelectionTool").type;
  const [lastShape, setLastShape] = createSignal<ToolType>("rectangle");
  const [lastLinear, setLastLinear] = createSignal<ToolType>("arrow");

  const shapeSlot = createMemo((): ToolType => {
    const type = activeTool().type;
    return (PHONE_SHAPES as readonly string[]).includes(type) ? (type as ToolType) : lastShape();
  });
  const linearSlot = createMemo((): ToolType => {
    const type = activeTool().type;
    return (PHONE_LINEAR as readonly string[]).includes(type) ? (type as ToolType) : lastLinear();
  });
  const shownTools = createMemo((): readonly ToolType[] => [
    "hand",
    preferredSelection() === "lasso" ? "lasso" : "selection",
    "freedraw",
    "eraser",
    shapeSlot(),
    linearSlot(),
    "text",
  ]);
  const more = createMemo((): string[] => [
    ...PHONE_SHAPES.filter((type) => type !== shapeSlot()),
    ...PHONE_LINEAR.filter((type) => type !== linearSlot()),
    "stickynote",
  ]);
  const pressed = (): string => {
    const type = activeTool().type;
    return (shownTools() as readonly string[]).includes(type) ? type : "";
  };

  const select = (type: ToolType): void => {
    const editor = ui.store.editor;
    if (!editor) return;
    if ((PHONE_SHAPES as readonly string[]).includes(type)) setLastShape(type);
    if ((PHONE_LINEAR as readonly string[]).includes(type)) setLastLinear(type);
    if (editor.state.activeTool.type !== type) {
      editor.batch(() => editor.setActiveTool({ type }));
    }
  };

  const label = (type: string): string => capitalizeString(t(`toolBar.${type}` as TranslationKey));

  return (
    <AriaToolbar aria-label={t("headings.shapes")} class={island} data-testid="phone-toolbar">
      <ToggleGroup
        type="single"
        spacing={1}
        value={pressed()}
        onValueChange={(value) => {
          if (typeof value === "string" && value !== "") select(value as ToolType);
        }}
        aria-label={t("headings.shapes")}
      >
        <For each={shownTools()}>
          {(type: ToolType) => (
            <ToggleGroupItem
              value={type}
              class={iconButton}
              aria-label={label(type)}
              title={label(type)}
              data-testid={`toolbar-${type}`}
            >
              <ToolGlyph type={type} />
            </ToggleGroupItem>
          )}
        </For>
      </ToggleGroup>
      <div class={divider} role="separator" aria-orientation="vertical" />
      <ExtraTools select={select} label={label} more={more()} />
    </AriaToolbar>
  );
}
