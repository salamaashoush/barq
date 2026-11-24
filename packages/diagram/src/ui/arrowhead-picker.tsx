import { For, createSignal } from "@barqjs/core";
import { Radio, RadioGroup } from "@barqjs/aria/radio";
import { Button } from "@barqjs/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";

import { useDiagramUI } from "./context.tsx";
import { Arrowhead as ArrowheadIcon, type ArrowheadGlyph } from "./icons.tsx";
import { gap, space } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { grid, iconButton, radioChoice } from "./styles.ts";

import type { Arrowhead } from "@excalidraw/element/types";

interface ArrowheadOption {
  value: ArrowheadGlyph;
  /** The key that picks it while the picker is open, as in Excalidraw. */
  key: string | null;
}

const ARROWHEADS: readonly ArrowheadOption[] = [
  { value: "none", key: "q" },
  { value: "arrow", key: "w" },
  { value: "triangle", key: "e" },
  { value: "triangle_outline", key: "r" },
  { value: "circle", key: "a" },
  { value: "circle_outline", key: "s" },
  { value: "diamond", key: "d" },
  { value: "diamond_outline", key: "f" },
  { value: "bar", key: "z" },
  { value: "cardinality_one", key: "x" },
  { value: "cardinality_many", key: "c" },
  { value: "cardinality_one_or_many", key: "v" },
  { value: "cardinality_exactly_one", key: null },
  { value: "cardinality_zero_or_one", key: null },
  { value: "cardinality_zero_or_many", key: null },
];

const arrowheadGrid = d(grid, gap[1], {
  gridTemplateColumns: "repeat(4, 32px)",
  padding: space.x2,
});

export interface ArrowheadPickerProps {
  position: "start" | "end";
  value: Arrowhead | null;
  onChange: (value: Arrowhead | null) => void;
}

/**
 * Excalidraw's arrowhead picker for one end: the end's arrowhead on a
 * button, and the fifteen in a popover, as radios the arrows move through
 * and a letter picks.
 */
export function ArrowheadPicker(props: ArrowheadPickerProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [open, setOpen] = createSignal(false);
  // drawn at the start, an arrowhead points the other way, mirrored again in RTL
  function flip(): boolean {
    return (props.position === "start") !== ui.rtl();
  }
  function label(value: ArrowheadGlyph): string {
    return t(`labels.arrowhead_${value}`);
  }
  function current(): ArrowheadGlyph {
    return props.value ?? "none";
  }
  // Excalidraw's own locale names the arrowheads but not the two ends; the
  // first picker is the start, as the arrow is drawn
  function name(): string {
    return `${t("labels.arrowheads")} ${props.position === "start" ? 1 : 2}`;
  }
  function pick(value: ArrowheadGlyph): void {
    setOpen(false);
    props.onChange(value === "none" ? null : value);
  }

  return (
    <Popover isOpen={open()} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          size="icon"
          class={iconButton}
          aria-label={`${name()}: ${label(current())}`}
          aria-haspopup="dialog"
          title={name()}
          data-testid={`arrowhead-${props.position}`}
        >
          <ArrowheadIcon type={current()} flip={flip()} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start">
        <div
          onKeyDown={(event: KeyboardEvent) => {
            const option = ARROWHEADS.find((each) => each.key === event.key.toLowerCase());
            if (option && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault();
              pick(option.value);
            }
          }}
        >
          <RadioGroup
            aria-label={name()}
            value={current()}
            orientation="horizontal"
            onChange={(value: string) => pick(value as ArrowheadGlyph)}
            class={arrowheadGrid}
          >
            <For each={ARROWHEADS}>
              {(option: ArrowheadOption) => (
                <Radio
                  value={option.value}
                  aria-label={label(option.value)}
                  elementType="span"
                  class={radioChoice}
                  data-testid={`arrowhead-${props.position}-${option.value}`}
                >
                  <span
                    title={
                      option.key
                        ? `${label(option.value)} — ${option.key.toUpperCase()}`
                        : label(option.value)
                    }
                  >
                    <ArrowheadIcon type={option.value} flip={flip()} />
                  </span>
                </Radio>
              )}
            </For>
          </RadioGroup>
        </div>
      </PopoverContent>
    </Popover>
  );
}
