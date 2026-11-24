import { type Child, type JSXElement, cells } from "@barqjs/core";
import { type Breakpoint, breakpoints, on } from "@barqjs/ui/conditions";
import type { UiProps } from "@barqjs/ui/props";
import { type RenderPart, partRender, uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { layout } from "../style/layout.ts";
import { space } from "../style/tokens.ts";

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

type Step = "base" | ViewportStep | ContainerQueryStep;

const VIEWPORT: readonly ViewportStep[] = ["sm", "md", "lg", "xl", "2xl"];
const CONTAINER: readonly ContainerQueryStep[] = ["cqSm", "cqMd", "cqLg", "cqXl"];

/** What each step is called in the custom property it sets: `--arc-gap-md`, `--arc-gap-cq-md`. */
const SUFFIX: Record<Step, string> = {
  base: "base",
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
  "2xl": "2xl",
  cqSm: "cq-sm",
  cqMd: "cq-md",
  cqLg: "cq-lg",
  cqXl: "cq-xl",
};

/**
 * A responsive prop is a few fixed rules and a value per step set on the
 * element, which is how Polaris and Primer lay a stack out.
 *
 * Each group below is one rule per step, each reading its step's custom
 * property: `--arc-gap-base` with no condition, `--arc-gap-md` under
 * `on.mdOnly`. The element is given the class of every step it has a value
 * for and the property with that value, inline, so the stylesheet holds the
 * same rules whatever value a page asks for, and a server-rendered element
 * carries everything it needs in its own markup.
 *
 * Ranges rather than `min-width` steps, because two `min-width` rules for one
 * property both match a wide screen and between two at-rules of one tier the
 * stylesheet decides by hash. A step's value holds until a wider one names
 * another, which `steps` works out, and a step that holds the base is left
 * out, so the base's rule covers it. Each element sets every property it
 * reads, so a value inherited from a stack around it is never read.
 */
const gapAt = arc.create({
  base: { gap: "var(--arc-gap-base)" },
  sm: { gap: { [on.smOnly]: "var(--arc-gap-sm)" } },
  md: { gap: { [on.mdOnly]: "var(--arc-gap-md)" } },
  lg: { gap: { [on.lgOnly]: "var(--arc-gap-lg)" } },
  xl: { gap: { [on.xlOnly]: "var(--arc-gap-xl)" } },
  "2xl": { gap: { [on["2xl"]]: "var(--arc-gap-2xl)" } },
  cqSm: { gap: { [on.cqSmOnly]: "var(--arc-gap-cq-sm)" } },
  cqMd: { gap: { [on.cqMdOnly]: "var(--arc-gap-cq-md)" } },
  cqLg: { gap: { [on.cqLgOnly]: "var(--arc-gap-cq-lg)" } },
  cqXl: { gap: { [on.cqXl]: "var(--arc-gap-cq-xl)" } },
});

const alignAt = arc.create({
  base: { alignItems: "var(--arc-align-base)" },
  sm: { alignItems: { [on.smOnly]: "var(--arc-align-sm)" } },
  md: { alignItems: { [on.mdOnly]: "var(--arc-align-md)" } },
  lg: { alignItems: { [on.lgOnly]: "var(--arc-align-lg)" } },
  xl: { alignItems: { [on.xlOnly]: "var(--arc-align-xl)" } },
  "2xl": { alignItems: { [on["2xl"]]: "var(--arc-align-2xl)" } },
  cqSm: { alignItems: { [on.cqSmOnly]: "var(--arc-align-cq-sm)" } },
  cqMd: { alignItems: { [on.cqMdOnly]: "var(--arc-align-cq-md)" } },
  cqLg: { alignItems: { [on.cqLgOnly]: "var(--arc-align-cq-lg)" } },
  cqXl: { alignItems: { [on.cqXl]: "var(--arc-align-cq-xl)" } },
});

const justifyAt = arc.create({
  base: { justifyContent: "var(--arc-justify-base)" },
  sm: { justifyContent: { [on.smOnly]: "var(--arc-justify-sm)" } },
  md: { justifyContent: { [on.mdOnly]: "var(--arc-justify-md)" } },
  lg: { justifyContent: { [on.lgOnly]: "var(--arc-justify-lg)" } },
  xl: { justifyContent: { [on.xlOnly]: "var(--arc-justify-xl)" } },
  "2xl": { justifyContent: { [on["2xl"]]: "var(--arc-justify-2xl)" } },
  cqSm: { justifyContent: { [on.cqSmOnly]: "var(--arc-justify-cq-sm)" } },
  cqMd: { justifyContent: { [on.cqMdOnly]: "var(--arc-justify-cq-md)" } },
  cqLg: { justifyContent: { [on.cqLgOnly]: "var(--arc-justify-cq-lg)" } },
  cqXl: { justifyContent: { [on.cqXl]: "var(--arc-justify-cq-xl)" } },
});

/** Equal columns, as a count: the property holds `3`, and the rule the track list. */
const columnsAt = arc.create({
  base: { gridTemplateColumns: "repeat(var(--arc-columns-base), minmax(0, 1fr))" },
  sm: { gridTemplateColumns: { [on.smOnly]: "repeat(var(--arc-columns-sm), minmax(0, 1fr))" } },
  md: { gridTemplateColumns: { [on.mdOnly]: "repeat(var(--arc-columns-md), minmax(0, 1fr))" } },
  lg: { gridTemplateColumns: { [on.lgOnly]: "repeat(var(--arc-columns-lg), minmax(0, 1fr))" } },
  xl: { gridTemplateColumns: { [on.xlOnly]: "repeat(var(--arc-columns-xl), minmax(0, 1fr))" } },
  "2xl": {
    gridTemplateColumns: { [on["2xl"]]: "repeat(var(--arc-columns-2xl), minmax(0, 1fr))" },
  },
  cqSm: {
    gridTemplateColumns: { [on.cqSmOnly]: "repeat(var(--arc-columns-cq-sm), minmax(0, 1fr))" },
  },
  cqMd: {
    gridTemplateColumns: { [on.cqMdOnly]: "repeat(var(--arc-columns-cq-md), minmax(0, 1fr))" },
  },
  cqLg: {
    gridTemplateColumns: { [on.cqLgOnly]: "repeat(var(--arc-columns-cq-lg), minmax(0, 1fr))" },
  },
  cqXl: {
    gridTemplateColumns: { [on.cqXl]: "repeat(var(--arc-columns-cq-xl), minmax(0, 1fr))" },
  },
});

const padAt = arc.create({
  base: { paddingInline: "var(--arc-padding-base)" },
  sm: { paddingInline: { [on.smOnly]: "var(--arc-padding-sm)" } },
  md: { paddingInline: { [on.mdOnly]: "var(--arc-padding-md)" } },
  lg: { paddingInline: { [on.lgOnly]: "var(--arc-padding-lg)" } },
  xl: { paddingInline: { [on.xlOnly]: "var(--arc-padding-xl)" } },
  "2xl": { paddingInline: { [on["2xl"]]: "var(--arc-padding-2xl)" } },
  cqSm: { paddingInline: { [on.cqSmOnly]: "var(--arc-padding-cq-sm)" } },
  cqMd: { paddingInline: { [on.cqMdOnly]: "var(--arc-padding-cq-md)" } },
  cqLg: { paddingInline: { [on.cqLgOnly]: "var(--arc-padding-cq-lg)" } },
  cqXl: { paddingInline: { [on.cqXl]: "var(--arc-padding-cq-xl)" } },
});

/** Stacked below a step and side by side from it: one condition, so no variable. */
const sideBySideFrom = arc.create({
  sm: { flexDirection: { default: "column", [on.sm]: "row" } },
  md: { flexDirection: { default: "column", [on.md]: "row" } },
  lg: { flexDirection: { default: "column", [on.lg]: "row" } },
  xl: { flexDirection: { default: "column", [on.xl]: "row" } },
  "2xl": { flexDirection: { default: "column", [on["2xl"]]: "row" } },
  cqSm: { flexDirection: { default: "column", [on.cqSm]: "row" } },
  cqMd: { flexDirection: { default: "column", [on.cqMd]: "row" } },
  cqLg: { flexDirection: { default: "column", [on.cqLg]: "row" } },
  cqXl: { flexDirection: { default: "column", [on.cqXl]: "row" } },
});

/** Classes and the custom properties they read, as a layout component builds them up. */
interface Drawn {
  readonly classes: string[];
  readonly style: Record<string, string>;
}

/**
 * One responsive prop onto `into`: the base, and every step whose value is not
 * the base's, each as its rule's class and its property's value.
 *
 * `token` turns a step's value into what the property holds, and is where a
 * value that is not one of the system's tokens is refused, so a page cannot
 * put a length the scale does not have into a stack's gap.
 */
function steps<T>(
  into: Drawn,
  name: string,
  group: Record<Step, string>,
  value: Responsive<T> | undefined,
  token: (value: T) => string,
): void {
  function set(step: Step, css: string): void {
    into.classes.push(group[step]);
    into.style[`--arc-${name}-${SUFFIX[step]}`] = css;
  }
  if (value === undefined) return;
  if (typeof value !== "object" || value === null) {
    set("base", token(value));
    return;
  }
  const given = value as Partial<Record<Step, T>>;
  const base = given.base === undefined ? undefined : token(given.base);
  if (base !== undefined) set("base", base);
  const scale = CONTAINER.some((step) => given[step] !== undefined) ? CONTAINER : VIEWPORT;
  let current = base;
  for (const step of scale) {
    const named = given[step];
    if (named !== undefined) current = token(named);
    if (current !== undefined && current !== base) set(step, current);
  }
}

function refuse(what: string, value: unknown): never {
  throw new TypeError(`${String(value)} is not ${what}`);
}

/** A step of the spacing scale as `space`'s token for it. */
function spaceOf(step: SpaceStep): string {
  const token = (space as Record<string, string>)[`x${String(step).replace(".", "_")}`];
  return token ?? refuse("a step of arc's spacing scale", step);
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

function alignOf(value: Align): string {
  return (Object.hasOwn(ALIGN, value) ? ALIGN[value] : undefined) ?? refuse("an alignment", value);
}

function justifyOf(value: Justify): string {
  return (
    (Object.hasOwn(JUSTIFY, value) ? JUSTIFY[value] : undefined) ?? refuse("a justification", value)
  );
}

function countOf(count: number): string {
  return Number.isInteger(count) && count >= 1 ? String(count) : refuse("a column count", count);
}

const grid = arc({ display: "grid" });

/** As many columns as fit, none narrower than the length the element sets. */
const fitting = arc({
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, var(--arc-min-item)), 1fr))",
});

/** A length in `rem`, `em`, `ch` or `px`, which is what `minItemWidth` takes. */
export type Length = `${number}${"rem" | "em" | "ch" | "px"}`;

const LENGTH = /^\d+(\.\d+)?(rem|em|ch|px)$/;

const container = arc(layout.container, layout.centred);

const widest = arc({ maxWidth: "var(--arc-max-width)" });

export type ContainerSize = Breakpoint | "full";

interface LayoutProps extends UiProps {
  /** Another element in this one's place, built from the props it is handed: a `<ul>`, a `<section>`. */
  render?: RenderPart<Child>;
}

/** The element a layout component draws, or the caller's in its place. */
function drawn(slot: string, styles: () => Drawn, props: LayoutProps): JSXElement {
  const given = cells(props);
  const own = uiProps(slot, () => styles().classes.join(" "), given);
  function style(): Record<string, string | number> {
    const out: Record<string, string | number> = { ...styles().style };
    for (const [name, value] of Object.entries(given.style?.() ?? {})) {
      if (value !== undefined) out[name] = value;
    }
    return out;
  }
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
        () => {
          const out: Drawn = { classes: [layout.column], style: {} };
          steps(out, "gap", gapAt, props.gap ?? 4, spaceOf);
          steps(out, "align", alignAt, props.align, alignOf);
          steps(out, "justify", justifyAt, props.justify, justifyOf);
          return out;
        },
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
  return (
    <>
      {drawn(
        "inline",
        () => {
          const out: Drawn = { classes: [layout.row], style: {} };
          if (props.wrap !== false) out.classes.push(layout.wrap);
          if (props.stackBelow !== undefined) out.classes.push(sideBySideFrom[props.stackBelow]);
          steps(out, "gap", gapAt, props.gap ?? 2, spaceOf);
          steps(out, "align", alignAt, props.align, alignOf);
          steps(out, "justify", justifyAt, props.justify, justifyOf);
          return out;
        },
        props,
      )}
    </>
  );
}

export interface GridProps extends LayoutProps {
  /** Equal columns, per step. */
  columns?: Responsive<number>;
  /**
   * As many columns as fit, none narrower than this length; for cards that
   * reflow with no breakpoint at all. Ignored when `columns` is given.
   */
  minItemWidth?: Length;
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
  return (
    <>
      {drawn(
        "grid",
        () => {
          const out: Drawn = { classes: [grid], style: {} };
          steps(out, "gap", gapAt, props.gap ?? 4, spaceOf);
          if (props.columns !== undefined) {
            steps(out, "columns", columnsAt, props.columns, countOf);
          } else if (props.minItemWidth !== undefined) {
            const width = props.minItemWidth;
            out.classes.push(fitting);
            out.style["--arc-min-item"] = LENGTH.test(width) ? width : refuse("a length", width);
          }
          steps(out, "align", alignAt, props.align, alignOf);
          return out;
        },
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
        () => {
          const size = props.size ?? "xl";
          const out: Drawn = { classes: [container, widest], style: {} };
          out.style["--arc-max-width"] =
            size === "full"
              ? "none"
              : ((Object.hasOwn(breakpoints, size) ? breakpoints[size] : undefined) ??
                refuse("a container size", size));
          steps(out, "padding", padAt, props.padding ?? { base: 4, md: 6 }, spaceOf);
          return out;
        },
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
        () => ({
          classes: [props.inline === true ? layout.inlineCentre : layout.centre],
          style: {},
        }),
        props,
      )}
    </>
  );
}
