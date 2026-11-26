import { For, Show, createSignal, createUniqueId } from "@barqjs/core";
import type { Child } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { Plus } from "@barqjs/lucide/icons/plus";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { Input } from "@barqjs/ui/input";
import { Textarea } from "@barqjs/ui/textarea";
import { tokens } from "@barqjs/ui/theme/tokens";

import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Classes, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  place,
  plainList,
  rounded,
  type,
} from "../style/index.ts";

/** A place on a picture, as a share of its width and height, with what it shows. */
export interface PictureLabel {
  id: string;
  x: number;
  y: number;
  title: string;
  text: string;
}

/** Places named on one picture. */
export const MAX_PICTURE_LABELS = 12;

const number = arc(layout.inlineCentre, rounded.full, type.numeric, type.strong, bg.primary, {
  width: "1.75rem",
  height: "1.75rem",
  flex: "none",
  color: tokens.primaryForeground,
  fontSize: "0.8125rem",
  lineHeight: "1",
});

/** A dot over a picture at a share of its width and height, ringed so it shows on any picture. */
export const spotMarker = arc(focus.visible, place.unpadded, edge.none, interaction.pressable, {
  position: "absolute",
  translate: "-50% -50%",
  boxShadow: `0 0 0 2px ${tokens.background}, 0 1px 4px color-mix(in oklab, ${tokens.foreground} 35%, transparent)`,
});

/** The picture a dot is set on, in a form: as wide as it is, up to the form's width. */
export const spotFrame = arc(layout.relative, rounded.md, interaction.draggable, {
  width: "fit-content",
  maxWidth: "100%",
  overflow: "hidden",
  userSelect: "none",
});

/** The picture inside `spotFrame`, kept short enough to leave the form's fields in view. */
export const spotPicture = arc(place.block, { width: "auto", maxWidth: "100%" });

export const pictureLabelsStyles = variants({
  slots: {
    root: arc(layout.column, gap[2]),
    frame: arc(layout.relative),
    marker: arc(number, spotMarker, {
      "[data-open]": { boxShadow: `0 0 0 3px ${tokens.background}, 0 0 0 6px ${tokens.primary}` },
      "[data-moving]": {
        boxShadow: `0 0 0 3px ${tokens.background}, 0 0 0 6px ${tokens.primary}`,
      },
    }),
    number,
    card: arc(layout.row, gap[3], edge.all, rounded.md, type.body, place.padded, {
      alignItems: "start",
      [on.print]: { display: "none" },
    }),
    cardText: arc(layout.column, layout.grow, layout.minZero, gap[0.5]),
    cardBody: arc(fg.muted, layout.flush),
    list: arc(plainList, layout.column, gap[1], type.body, {
      display: { default: "none", [on.print]: "flex" },
    }),
    editor: arc(layout.column, gap[3], edge.none, layout.flush, place.unpadded),
    editorHead: arc(layout.row, layout.between, gap[2]),
    legend: arc(type.label, { float: "inline-start" }),
    editorFrame: spotFrame,
    editorPicture: arc(spotPicture, { maxHeight: "14rem" }),
    row: arc(layout.row, gap[2], { alignItems: "start" }),
    fields: arc(layout.column, layout.grow, layout.minZero, gap[2]),
  },
});

type Slots = ReturnType<typeof pictureLabelsStyles>;

export interface LabelledPictureProps {
  labels: readonly PictureLabel[];
  /** The reader's: each number a button that opens its place. Off while the picture is edited. */
  interactive: boolean;
  /** The frame's class, which the picture and its labels sit in. */
  frameClass?: string;
  /** Over the picture with the labels: an upload's progress. */
  overlay?: Child;
  classes?: Classes<Slots>;
  children: Child;
}

/**
 * A picture with numbered places its reader opens one at a time, as an
 * image-hotspot graphic does: each number is a button naming its place, and
 * what it shows opens under the picture, where a phone has room for it. On
 * paper every place is listed instead. While the picture is edited, the
 * numbers only mark where each place is.
 */
export function LabelledPicture(props: LabelledPictureProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const cardId = createUniqueId();
  const [open, setOpen] = createSignal<number | null>(null, { ownedWrite: true });
  function cls(): Slots {
    return parts(pictureLabelsStyles(), props.classes);
  }
  function digit(index: number): string {
    return new Intl.NumberFormat(locale().locale).format(index + 1);
  }
  function name(label: PictureLabel, index: number): string {
    return label.title.trim() === "" ? messages().pictureLabel(digit(index)) : label.title;
  }
  function shown(): PictureLabel | undefined {
    const index = open();
    return index === null ? undefined : props.labels[index];
  }
  return (
    <>
      <div class={arc(cls().frame, props.frameClass)} data-slot="editor-image-frame" dir="ltr">
        {props.children}
        <For each={props.labels}>
          {(label: PictureLabel, index: () => number) => (
            <Show
              when={props.interactive}
              fallback={
                <span
                  class={cls().marker}
                  data-slot="picture-label-marker"
                  aria-hidden="true"
                  style={{ left: `${String(label.x * 100)}%`, top: `${String(label.y * 100)}%` }}
                >
                  {digit(index())}
                </span>
              }
            >
              <button
                type="button"
                class={cls().marker}
                data-slot="picture-label-marker"
                data-open={open() === index() ? "" : undefined}
                aria-label={`${digit(index())}. ${name(label, index())}`}
                aria-expanded={open() === index()}
                aria-controls={cardId}
                style={{ left: `${String(label.x * 100)}%`, top: `${String(label.y * 100)}%` }}
                onClick={() => setOpen(open() === index() ? null : index())}
              >
                {digit(index())}
              </button>
            </Show>
          )}
        </For>
        {props.overlay}
      </div>
      <Show when={props.interactive && props.labels.length > 0}>
        <div id={cardId} data-slot="picture-label-panel" aria-live="polite">
          <Show when={shown()}>
            {(label: () => PictureLabel) => (
              <div class={cls().card} data-slot="picture-label-card">
                <span class={cls().number} aria-hidden="true">
                  {digit(open() ?? 0)}
                </span>
                <div class={cls().cardText} dir="auto">
                  <strong>{name(label(), open() ?? 0)}</strong>
                  <Show when={label().text !== ""}>
                    <p class={cls().cardBody}>{label().text}</p>
                  </Show>
                </div>
                <IconButton
                  label={messages().close}
                  size="sm"
                  variant="ghost"
                  onPress={() => setOpen(null)}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </div>
            )}
          </Show>
        </div>
        <ol class={cls().list} data-slot="picture-label-list">
          <For each={props.labels}>
            {(label: PictureLabel, index: () => number) => (
              <li dir="auto">
                <strong>{`${digit(index())}. ${name(label, index())}`}</strong>
                {label.text === "" ? null : ` ${label.text}`}
              </li>
            )}
          </For>
        </ol>
      </Show>
    </>
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

let made = 0;

function labelId(): string {
  made += 1;
  return `label-${Date.now().toString(36)}-${String(made)}`;
}

/** Where on a picture, as a share of its width and height. */
interface Spot {
  x: number;
  y: number;
}

interface Dragging extends Spot {
  index: number;
}

export interface PictureLabelsEditorProps {
  src: string;
  alt: string;
  labels: readonly PictureLabel[];
  onChange: (labels: PictureLabel[]) => void;
  classes?: Classes<Slots>;
}

/**
 * A picture's numbered places as they are set: each number dragged into
 * place by mouse or finger, or moved by the arrow keys (a step, or a stride
 * with Shift), which keep the picture's own left and right whatever the
 * page's direction; each named and described beside it. A new one starts in
 * the middle; at most twelve.
 */
export function PictureLabelsEditor(props: PictureLabelsEditorProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  let frame: HTMLDivElement | undefined;
  const [dragging, setDragging] = createSignal<Dragging | null>(null, { ownedWrite: true });
  function cls(): Slots {
    return parts(pictureLabelsStyles(), props.classes);
  }
  function digit(index: number): string {
    return new Intl.NumberFormat(locale().locale).format(index + 1);
  }
  function change(index: number, patch: Partial<PictureLabel>): void {
    props.onChange(
      props.labels.map((label, other) => (other === index ? { ...label, ...patch } : label)),
    );
  }
  function placeOf(event: PointerEvent): Spot | null {
    const box = frame?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return null;
    return {
      x: round(clamp((event.clientX - box.left) / box.width)),
      y: round(clamp((event.clientY - box.top) / box.height)),
    };
  }
  function shownAt(label: PictureLabel, index: number): Spot {
    const moving = dragging();
    return moving?.index === index ? moving : label;
  }
  return (
    <fieldset class={cls().editor} data-slot="picture-labels-editor">
      <div class={cls().editorHead}>
        <legend class={cls().legend}>{messages().pictureLabels}</legend>
        <Show when={props.labels.length < MAX_PICTURE_LABELS}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              props.onChange([
                ...props.labels,
                { id: labelId(), x: 0.5, y: 0.5, title: "", text: "" },
              ])
            }
          >
            <Plus aria-hidden="true" />
            {messages().addPictureLabel}
          </Button>
        </Show>
      </div>
      <div
        ref={(element: HTMLDivElement) => {
          frame = element;
        }}
        class={cls().editorFrame}
        dir="ltr"
        data-slot="picture-labels-frame"
      >
        <img class={cls().editorPicture} src={props.src} alt={props.alt} draggable={false} />
        <For each={props.labels} keyed={(label: PictureLabel) => label.id}>
          {(label: () => PictureLabel, index: () => number) => (
            <button
              type="button"
              class={cls().marker}
              data-slot="picture-label-marker"
              data-moving={dragging()?.index === index() ? "" : undefined}
              aria-label={messages().movePictureLabel(digit(index()))}
              style={{
                left: `${String(shownAt(label(), index()).x * 100)}%`,
                top: `${String(shownAt(label(), index()).y * 100)}%`,
              }}
              onPointerDown={(event: PointerEvent) => {
                event.preventDefault();
                (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                setDragging({ index: index(), x: label().x, y: label().y });
              }}
              onPointerMove={(event: PointerEvent) => {
                if (dragging()?.index !== index()) return;
                const next = placeOf(event);
                if (next !== null) setDragging({ index: index(), ...next });
              }}
              onPointerUp={(event: PointerEvent) => {
                if (dragging()?.index !== index()) return;
                const next = placeOf(event);
                setDragging(null);
                if (next !== null) change(index(), next);
              }}
              onKeyDown={(event: KeyboardEvent) => {
                const move = MOVES[event.key];
                if (move === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey ? 0.05 : 0.01;
                change(index(), {
                  x: round(clamp(label().x + move[0] * step)),
                  y: round(clamp(label().y + move[1] * step)),
                });
              }}
            >
              {digit(index())}
            </button>
          )}
        </For>
      </div>
      <For each={props.labels} keyed={(label: PictureLabel) => label.id}>
        {(label: () => PictureLabel, index: () => number) => (
          <div class={cls().row} data-slot="picture-label-fields">
            <span class={cls().number} aria-hidden="true">
              {digit(index())}
            </span>
            <div class={cls().fields}>
              <Input
                aria-label={messages().pictureLabelTitle(digit(index()))}
                placeholder={messages().pictureLabelTitlePlaceholder}
                value={label().title}
                maxLength={80}
                dir="auto"
                onInput={(event: Event) =>
                  change(index(), { title: (event.currentTarget as HTMLInputElement).value })
                }
              />
              <Textarea
                aria-label={messages().pictureLabelText(digit(index()))}
                placeholder={messages().pictureLabelTextPlaceholder}
                value={label().text}
                maxLength={500}
                rows={2}
                dir="auto"
                onInput={(event: Event) =>
                  change(index(), { text: (event.currentTarget as HTMLTextAreaElement).value })
                }
              />
            </div>
            <IconButton
              label={messages().removePictureLabel(digit(index()))}
              size="sm"
              variant="ghost"
              onPress={() => props.onChange(props.labels.filter((_, other) => other !== index()))}
            >
              <X aria-hidden="true" />
            </IconButton>
          </div>
        )}
      </For>
    </fieldset>
  );
}
