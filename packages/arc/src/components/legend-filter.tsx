import { type Child, For, Show, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { ListFilter } from "@barqjs/lucide/icons/list-filter";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, rounded, square } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { chartNumbers, toneColour } from "./chart-frame.tsx";
import { Chip } from "./chip.tsx";
import { useArcMessages } from "./messages.ts";

/** One thing the legend shows or hides: a series, a kind of event. */
export interface LegendFilterItem {
  key: string;
  label: string;
  /** Its swatch in a tone of the theme. @default the theme's `--chart-N` */
  tone?: Tone;
  /** Any colour, which wins over `tone`. */
  color?: string;
  /** Its swatch is a dashed stroke, as its line is drawn. */
  dashed?: boolean;
  /** An icon in place of the swatch. */
  icon?: Child;
}

export const legendFilterStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero),
    chips: arc(layout.row, layout.wrap, gap[2], {
      display: { default: "none", [on.cqSm]: "flex" },
    }),
    menu: arc({ display: { default: "block", [on.cqSm]: "none" } }),
    swatch: arc(rounded.xs, square.x2, {
      display: "inline-block",
      "&[data-dashed]": {
        blockSize: "0px",
        borderBlockStartWidth: "2px",
        borderBlockStartStyle: "dashed",
        borderRadius: "0px",
      },
    }),
  },
});

export type LegendFilterSlots = ReturnType<typeof legendFilterStyles>;

export interface LegendFilterProps extends Customisable<LegendFilterSlots> {
  /** Names the chips and the menu's button: `"Series"`, `"Kinds"`. */
  label: string;
  items: readonly LegendFilterItem[];
  /** The keys hidden: the caller's. */
  hidden?: readonly string[];
  defaultHidden?: readonly string[];
  onHiddenChange?: (hidden: readonly string[]) => void;
  id?: string;
}

interface SwatchProps {
  class: string;
  item: LegendFilterItem;
  at: number;
}

function Swatch(props: SwatchProps) {
  function colour(): string {
    return props.item.color ?? toneColour(props.item.tone, props.at);
  }
  return (
    <Show when={props.item.icon === undefined} fallback={props.item.icon}>
      <span
        class={props.class}
        data-slot="legend-filter-swatch"
        data-dashed={props.item.dashed === true ? "" : undefined}
        style={
          props.item.dashed === true
            ? { "border-block-start-color": colour() }
            : { "background-color": colour() }
        }
      />
    </Show>
  );
}

/**
 * A legend that is also the filter: a chip per series or kind, pressed while
 * it is shown, which hides it when pressed again. In a narrow box the chips
 * fold into one button whose menu holds the same choices.
 *
 * ```tsx
 * <LegendFilter label="Kinds" items={kinds} hidden={hidden()} onHiddenChange={setHidden} />
 * <ComboChart legend="filter" ... />
 * ```
 *
 * Each chip is a toggle button named by its item, pressed while shown, with
 * a check as well as its swatch so the state never rests on colour; the
 * menu's items are checkboxes, with "Show all" once any is hidden, and its
 * button says how many of how many are shown.
 */
export function LegendFilter(props: LegendFilterProps) {
  const messages = useArcMessages();
  const number = chartNumbers();
  const [hidden, setHidden] = controllable<readonly string[]>(
    () => props.hidden,
    () => untrack(() => props.defaultHidden) ?? [],
    (next) => props.onHiddenChange?.(next),
  );
  function cls(): LegendFilterSlots {
    return parts(legendFilterStyles(), props.classes);
  }
  function shownCount(): number {
    return props.items.filter((item) => !hidden().includes(item.key)).length;
  }
  function toggle(key: string, shown: boolean): void {
    const rest = hidden().filter((one) => one !== key);
    setHidden(shown ? rest : [...rest, key]);
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="legend-filter"
    >
      <div
        class={cls().chips}
        data-slot="legend-filter-chips"
        role="group"
        aria-label={props.label}
      >
        <For each={() => props.items}>
          {(item: LegendFilterItem, at: () => number) => (
            <Chip
              size="sm"
              selected={!hidden().includes(item.key)}
              onSelectedChange={(shown: boolean) => toggle(item.key, shown)}
              icon={<Swatch class={cls().swatch} item={item} at={at()} />}
            >
              {item.label}
            </Chip>
          )}
        </For>
      </div>
      <div class={cls().menu} data-slot="legend-filter-menu">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="sm" data-slot="legend-filter-trigger">
              <ListFilter aria-hidden="true" />
              {hidden().length === 0
                ? props.label
                : messages().legendShown(
                    props.label,
                    number(shownCount()),
                    number(props.items.length),
                  )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={props.label} shouldCloseOnSelect={false}>
            <For each={() => props.items}>
              {(item: LegendFilterItem, at: () => number) => (
                <DropdownMenuCheckboxItem
                  checked={!hidden().includes(item.key)}
                  onCheckedChange={(shown: boolean) => toggle(item.key, shown)}
                >
                  <Swatch class={cls().swatch} item={item} at={at()} />
                  {item.label}
                </DropdownMenuCheckboxItem>
              )}
            </For>
            <Show when={hidden().length > 0}>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setHidden([])}>
                {messages().showEvery}
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
