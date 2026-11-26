import { For } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, layout, space, surface } from "../style/index.ts";
import { StatCard, type StatCardProps } from "./stat-card.tsx";

export const statGroupStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero),
    grid: arc(layout.wrap, {
      display: "flex",
      gap: "var(--arc-stat-gap)",
      "--arc-stat-per-row": {
        default: "2",
        [on.cqMd]: "min(3, var(--arc-stat-columns))",
        [on.cqLg]: "var(--arc-stat-columns)",
      },
    }),
    stat: arc(layout.minZero, {
      flex: "1 1 calc((100% - (var(--arc-stat-per-row) - 1) * var(--arc-stat-gap)) / var(--arc-stat-per-row))",
    }),
  },
  variants: {
    variant: {
      joined: {
        grid: arc(surface.bordered, layout.clip, {
          "--arc-stat-gap": "1px",
          backgroundColor: tokens.border,
        }),
        stat: arc(edge.none, { borderRadius: "0px" }),
      },
      separate: { grid: arc({ "--arc-stat-gap": space.x4 }) },
    },
  },
  defaults: { variant: "joined" },
});

type Slots = ReturnType<typeof statGroupStyles>;

export interface StatGroupProps extends Customisable<Slots> {
  /** Each a `StatCard`'s props. */
  stats: readonly StatCardProps[];
  /** One bordered strip with rules between, or cards apart. @default "joined" */
  variant?: "joined" | "separate";
  /** Across a wide container, how many in a row. @default how many there are, up to 5 */
  columns?: number;
  /** Every card's shapes in place of its number while the numbers load. */
  loading?: boolean;
  /** Names the group. */
  "aria-label"?: string;
  id?: string;
}

/**
 * A row of key numbers read together: a dashboard's top line, a report's
 * totals.
 *
 * ```tsx
 * <StatGroup
 *   aria-label="This month"
 *   stats={[
 *     { label: "Runs", value: "12,480", delta: { value: "+8%", tone: "success", direction: "up" } },
 *     { label: "Failures", value: "37" },
 *     { label: "Uptime", value: "99.96%" },
 *   ]}
 * />
 * ```
 *
 * `StatCard`s two across a narrow container, three across a middling one and
 * `columns` across a wide one, the cards of a short last row growing to
 * fill it. `joined` draws them as one bordered strip with a rule between
 * each, on both axes as they wrap.
 */
export function StatGroup(props: StatGroupProps) {
  function cls(): Slots {
    return parts(statGroupStyles({ variant: props.variant }), props.classes);
  }
  function columns(): number {
    return props.columns ?? Math.min(5, Math.max(1, props.stats.length));
  }
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="stat-group"
      aria-label={props["aria-label"]}
    >
      <div
        class={cls().grid}
        data-slot="stat-group-grid"
        style={{ "--arc-stat-columns": String(columns()) }}
      >
        <For each={() => props.stats}>
          {(stat: StatCardProps) => (
            <StatCard
              {...stat}
              class={arc(cls().stat, stat.class)}
              loading={stat.loading ?? props.loading}
            />
          )}
        </For>
      </div>
    </section>
  );
}
