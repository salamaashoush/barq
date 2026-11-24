import { type Child, type JSXElement, cells } from "@barqjs/core";
import type { DynamicStyle } from "@barqjs/css";
import { type Breakpoint, breakpoints, on } from "@barqjs/ui/conditions";
import type { UiProps } from "@barqjs/ui/props";
import { type RenderPart, partRender, uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { layout } from "../style/index.ts";

/** A step of the spacing scale: `4` is `calc(var(--spacing) * 4)`. */
export type SpaceStep = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

export type ViewportStep = Breakpoint;
export type ContainerQueryStep = "cqSm" | "cqMd" | "cqLg" | "cqXl";

/**
 * A value, or a value per step: `{ base: 2, md: 4 }` from the viewport, or
 * `{ base: 1, cqMd: 3 }` from the nearest query container.
 *
 * Mobile first: a step holds until a wider one names another value. One prop
 * reads one of the two scales, never both, because a viewport rule and a
 * container rule can match one element at once and nothing would decide
 * between them.
 */
export type Responsive<T> =
  | T
  | ({ readonly base?: T } & { readonly [K in ViewportStep]?: T })
  | ({ readonly base?: T } & { readonly [K in ContainerQueryStep]?: T });

const VIEWPORT: readonly ViewportStep[] = ["sm", "md", "lg", "xl", "2xl"];
const CONTAINER: readonly ContainerQueryStep[] = ["cqSm", "cqMd", "cqLg", "cqXl"];

/**
 * The value for each range a step covers, in the order the groups below take
 * them: the unconditional one, the five viewport ranges, the four container
 * ranges. A range that says what the base already says is left out, so the
 * base's one class covers it.
 *
 * Ranges rather than `min-width` steps because a dynamic group writes one rule
 * per condition and two `min-width` rules for one property both match a wide
 * screen; the stylesheet would decide between them by hash.
 */
type Ranges = readonly [
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
];

function ranges<T>(value: Responsive<T> | undefined, css: (value: T) => string): Ranges {
  const out: (string | undefined)[] = Array.from({ length: 10 });
  if (value === undefined) return out as unknown as Ranges;
  if (typeof value !== "object" || value === null) {
    out[0] = css(value);
    return out as unknown as Ranges;
  }
  const steps = value as Partial<Record<"base" | ViewportStep | ContainerQueryStep, T>>;
  const base = steps.base === undefined ? undefined : css(steps.base);
  out[0] = base;
  const walk = (names: readonly string[], offset: number): void => {
    let current = base;
    names.forEach((name, index) => {
      const named = steps[name as ViewportStep];
      if (named !== undefined) current = css(named);
      out[offset + index] = current === base ? undefined : current;
    });
  };
  walk(VIEWPORT, 1);
  walk(CONTAINER, 6);
  return out as unknown as Ranges;
}

const spaceOf = (step: SpaceStep): string => `calc(var(--spacing) * ${String(step)})`;

const gapAt = arc.dynamic(
  (
    base?: string,
    sm?: string,
    md?: string,
    lg?: string,
    xl?: string,
    xxl?: string,
    cqSm?: string,
    cqMd?: string,
    cqLg?: string,
    cqXl?: string,
  ) => ({
    gap: {
      default: base,
      [on.smOnly]: sm,
      [on.mdOnly]: md,
      [on.lgOnly]: lg,
      [on.xlOnly]: xl,
      [on["2xl"]]: xxl,
      [on.cqSmOnly]: cqSm,
      [on.cqMdOnly]: cqMd,
      [on.cqLgOnly]: cqLg,
      [on.cqXl]: cqXl,
    },
  }),
);

const alignAt = arc.dynamic(
  (
    base?: string,
    sm?: string,
    md?: string,
    lg?: string,
    xl?: string,
    xxl?: string,
    cqSm?: string,
    cqMd?: string,
    cqLg?: string,
    cqXl?: string,
  ) => ({
    alignItems: {
      default: base,
      [on.smOnly]: sm,
      [on.mdOnly]: md,
      [on.lgOnly]: lg,
      [on.xlOnly]: xl,
      [on["2xl"]]: xxl,
      [on.cqSmOnly]: cqSm,
      [on.cqMdOnly]: cqMd,
      [on.cqLgOnly]: cqLg,
      [on.cqXl]: cqXl,
    },
  }),
);

const justifyAt = arc.dynamic(
  (
    base?: string,
    sm?: string,
    md?: string,
    lg?: string,
    xl?: string,
    xxl?: string,
    cqSm?: string,
    cqMd?: string,
    cqLg?: string,
    cqXl?: string,
  ) => ({
    justifyContent: {
      default: base,
      [on.smOnly]: sm,
      [on.mdOnly]: md,
      [on.lgOnly]: lg,
      [on.xlOnly]: xl,
      [on["2xl"]]: xxl,
      [on.cqSmOnly]: cqSm,
      [on.cqMdOnly]: cqMd,
      [on.cqLgOnly]: cqLg,
      [on.cqXl]: cqXl,
    },
  }),
);

type Direction = "row" | "column";

const directionAt = arc.dynamic(
  (
    base?: Direction,
    sm?: Direction,
    md?: Direction,
    lg?: Direction,
    xl?: Direction,
    xxl?: Direction,
    cqSm?: Direction,
    cqMd?: Direction,
    cqLg?: Direction,
    cqXl?: Direction,
  ) => ({
    flexDirection: {
      default: base,
      [on.smOnly]: sm,
      [on.mdOnly]: md,
      [on.lgOnly]: lg,
      [on.xlOnly]: xl,
      [on["2xl"]]: xxl,
      [on.cqSmOnly]: cqSm,
      [on.cqMdOnly]: cqMd,
      [on.cqLgOnly]: cqLg,
      [on.cqXl]: cqXl,
    },
  }),
);

const columnsAt = arc.dynamic(
  (
    base?: string,
    sm?: string,
    md?: string,
    lg?: string,
    xl?: string,
    xxl?: string,
    cqSm?: string,
    cqMd?: string,
    cqLg?: string,
    cqXl?: string,
  ) => ({
    gridTemplateColumns: {
      default: base,
      [on.smOnly]: sm,
      [on.mdOnly]: md,
      [on.lgOnly]: lg,
      [on.xlOnly]: xl,
      [on["2xl"]]: xxl,
      [on.cqSmOnly]: cqSm,
      [on.cqMdOnly]: cqMd,
      [on.cqLgOnly]: cqLg,
      [on.cqXl]: cqXl,
    },
  }),
);

const padAt = arc.dynamic(
  (
    base?: string,
    sm?: string,
    md?: string,
    lg?: string,
    xl?: string,
    xxl?: string,
    cqSm?: string,
    cqMd?: string,
    cqLg?: string,
    cqXl?: string,
  ) => ({
    paddingInline: {
      default: base,
      [on.smOnly]: sm,
      [on.mdOnly]: md,
      [on.lgOnly]: lg,
      [on.xlOnly]: xl,
      [on["2xl"]]: xxl,
      [on.cqSmOnly]: cqSm,
      [on.cqMdOnly]: cqMd,
      [on.cqLgOnly]: cqLg,
      [on.cqXl]: cqXl,
    },
  }),
);

type At = (...values: Ranges) => DynamicStyle;

function at(group: At, values: Ranges): DynamicStyle {
  return group(
    values[0],
    values[1],
    values[2],
    values[3],
    values[4],
    values[5],
    values[6],
    values[7],
    values[8],
    values[9],
  );
}

export type Align = "start" | "center" | "end" | "stretch" | "baseline";
export type Justify = "start" | "center" | "end" | "between";

const ALIGN: Record<Align, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const JUSTIFY: Record<Justify, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

const grid = arc({ display: "grid" });

const container = arc(layout.container, { marginInline: "auto", width: "100%" });

export type ContainerSize = Breakpoint | "full";

const widthOf = arc.dynamic((maxWidth: string) => ({ maxWidth }));

interface LayoutProps extends UiProps {
  /** Another element in this one's place, built from the props it is handed: a `<ul>`, a `<section>`. */
  render?: RenderPart<Child>;
}

/** The element a layout component draws, or the caller's in its place. */
function drawn(
  slot: string,
  styles: () => { class: string; style?: Record<string, string | number> },
  props: LayoutProps,
): JSXElement {
  const given = cells(props);
  const own = uiProps(slot, () => styles().class, given);
  const style = (): Record<string, string | number> => {
    const out: Record<string, string | number> = { ...styles().style };
    for (const [name, value] of Object.entries(given.style?.() ?? {})) {
      if (value !== undefined) out[name] = value;
    }
    return out;
  };
  const render = given.render?.();
  if (render !== undefined) {
    return render(partRender({ ...own, style: style() }), given.children?.()) as JSXElement;
  }
  return (
    <div {...own} style={style()}>
      {given.children?.()}
    </div>
  );
}

export interface StackProps extends LayoutProps {
  /** @default 4 */
  gap?: Responsive<SpaceStep>;
  /** @default "stretch" */
  align?: Responsive<Align>;
  justify?: Responsive<Justify>;
}

/**
 * Children one under the other, `gap` apart.
 *
 * ```tsx
 * <Stack gap={{ base: 3, md: 6 }}>
 *   <PageHeader heading="Invoices" />
 *   <DataTable … />
 * </Stack>
 * ```
 */
export function Stack(props: StackProps) {
  return (
    <>
      {drawn(
        "stack",
        () =>
          arc.props(
            layout.column,
            at(gapAt, ranges(props.gap ?? 4, spaceOf)),
            at(
              alignAt,
              ranges(props.align, (value) => ALIGN[value]),
            ),
            at(
              justifyAt,
              ranges(props.justify, (value) => JUSTIFY[value]),
            ),
          ),
        props,
      )}
    </>
  );
}

export interface InlineProps extends LayoutProps {
  /** @default 2 */
  gap?: Responsive<SpaceStep>;
  /** @default "center" */
  align?: Responsive<Align>;
  justify?: Responsive<Justify>;
  /** Children that do not fit move to a new line. @default true */
  wrap?: boolean;
  /**
   * Side by side from this step, stacked below it: `"md"` for a form row that
   * is one column on a phone.
   */
  stackBelow?: ViewportStep | ContainerQueryStep;
}

/**
 * Children side by side, wrapping when they run out of room: a toolbar, a row
 * of actions, a cluster of chips.
 *
 * ```tsx
 * <Inline gap={2} justify="between">
 *   <SearchField />
 *   <Button>New invoice</Button>
 * </Inline>
 * ```
 */
export function Inline(props: InlineProps) {
  const direction = (): Responsive<Direction> | undefined =>
    props.stackBelow === undefined ? undefined : { base: "column", [props.stackBelow]: "row" };
  return (
    <>
      {drawn(
        "inline",
        () =>
          arc.props(
            layout.row,
            props.wrap === false ? undefined : layout.wrap,
            at(gapAt, ranges(props.gap ?? 2, spaceOf)),
            at(
              alignAt,
              ranges(props.align, (value) => ALIGN[value]),
            ),
            at(
              justifyAt,
              ranges(props.justify, (value) => JUSTIFY[value]),
            ),
            at(
              directionAt as unknown as At,
              ranges(direction(), (value) => value),
            ),
          ),
        props,
      )}
    </>
  );
}

export interface GridProps extends LayoutProps {
  /** Equal columns, per step. */
  columns?: Responsive<number>;
  /**
   * As many columns as fit, none narrower than this CSS length; for cards
   * that reflow with no breakpoint at all. Ignored when `columns` is given.
   */
  minItemWidth?: string;
  /** @default 4 */
  gap?: Responsive<SpaceStep>;
  align?: Responsive<Align>;
}

/**
 * Children in a grid of equal columns.
 *
 * ```tsx
 * <Grid columns={{ base: 1, md: 2, xl: 4 }}>{stats}</Grid>
 * <Grid minItemWidth="16rem">{cards}</Grid>
 * ```
 */
export function Grid(props: GridProps) {
  const tracks = (): Responsive<string> | undefined => {
    const columns = props.columns;
    if (columns !== undefined) {
      if (typeof columns === "number") return `repeat(${String(columns)}, minmax(0, 1fr))`;
      const out: Record<string, string> = {};
      for (const [step, count] of Object.entries(columns)) {
        if (count !== undefined) out[step] = `repeat(${String(count)}, minmax(0, 1fr))`;
      }
      return out;
    }
    return props.minItemWidth === undefined
      ? undefined
      : `repeat(auto-fill, minmax(min(100%, ${props.minItemWidth}), 1fr))`;
  };
  return (
    <>
      {drawn(
        "grid",
        () =>
          arc.props(
            grid,
            at(gapAt, ranges(props.gap ?? 4, spaceOf)),
            at(
              columnsAt,
              ranges(tracks(), (value) => value),
            ),
            at(
              alignAt,
              ranges(props.align, (value) => ALIGN[value]),
            ),
          ),
        props,
      )}
    </>
  );
}

export interface ContainerProps extends LayoutProps {
  /** The widest it grows, as a viewport step's width. @default "xl" */
  size?: ContainerSize;
  /** The room at its sides. @default { base: 4, md: 6 } */
  padding?: Responsive<SpaceStep>;
}

/**
 * The page's column: centred, no wider than `size`, with room at its sides,
 * and a query container, so what is inside lays out by `cq*` steps.
 *
 * ```tsx
 * <Container size="lg">
 *   <Outlet />
 * </Container>
 * ```
 */
export function Container(props: ContainerProps) {
  return (
    <>
      {drawn(
        "container",
        () =>
          arc.props(
            container,
            widthOf(props.size === "full" ? "none" : breakpoints[props.size ?? "xl"]),
            at(padAt, ranges(props.padding ?? { base: 4, md: 6 }, spaceOf)),
          ),
        props,
      )}
    </>
  );
}

export interface CenterProps extends LayoutProps {
  /** Centred in a line of text rather than as a block. @default false */
  inline?: boolean;
}

/**
 * Its children centred both ways: an icon in a tile, a spinner in a pane.
 *
 * ```tsx
 * <Center style={{ height: "12rem" }}><Spinner /></Center>
 * ```
 */
export function Center(props: CenterProps) {
  return (
    <>
      {drawn(
        "center",
        () => arc.props(props.inline === true ? layout.inlineCentre : layout.centre),
        props,
      )}
    </>
  );
}
