import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, layout, space } from "../style/index.ts";

export type WorkbenchFill = "viewport" | "parent";

export const workbenchStyles = variants({
  slots: {
    root: arc(layout.minZero, layout.clip, bg.page, {
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr) auto",
      gridTemplateColumns: "minmax(0, 1fr)",
    }),
    bar: arc(edge.bottom, layout.minZero, { paddingInline: space.x3, paddingBlock: space.x1_5 }),
    main: arc(layout.minZero, layout.minZeroBlock, layout.clip, {
      display: "grid",
      gridTemplate: "minmax(0, 1fr) / minmax(0, 1fr)",
      gridRow: "2",
    }),
    status: arc(layout.minZero, { gridRow: "3" }),
  },
  variants: {
    fill: {
      viewport: { root: arc({ height: "100dvh" }) },
      parent: { root: arc({ height: "100%" }) },
    },
  },
  defaults: { fill: "viewport" },
});

type Slots = ReturnType<typeof workbenchStyles>;

export interface WorkbenchProps extends Customisable<Slots> {
  /** The row along the top: a title, a toolbar, a menu. */
  bar?: Child;
  /** The row along the foot: a `StatusBar`. */
  status?: Child;
  /** What fills the rest: a `ResizablePanelGroup`, an editor, a console. */
  children?: Child;
  /**
   * `viewport` is the whole screen's height, for an app that is the
   * workbench; `parent` is its container's, for one embedded in a page,
   * which then has to give it a height. @default "viewport"
   */
  fill?: WorkbenchFill;
  /**
   * The middle is the page's `<main>`. Off for a workbench inside a page
   * that has a main of its own. @default `fill` is `viewport`
   */
  landmark?: boolean;
  /** Names the middle region. */
  "aria-label"?: string;
  id?: string;
}

/**
 * The frame of an app that is one screen: an editor, a playground, a
 * dashboard of panels. A bar along the top, the status along the foot, and
 * the room between them filled by its children, which scroll inside
 * themselves rather than growing the page.
 *
 * ```tsx
 * <Workbench bar={<Toolbar>…</Toolbar>} status={<StatusBar language="Toy" />}>
 *   <ResizablePanelGroup direction="horizontal">…</ResizablePanelGroup>
 * </Workbench>
 * ```
 *
 * A grid of three rows: the bar and the status as tall as they are, the
 * middle the rest, with no minimum, so a `CodeEditor`, a `ConsoleLogView` or
 * a scroll area in it fills its panel and scrolls there. The bar is a
 * `<header>` and the status a `<footer>`. `AppShell` is the other frame, for
 * an app of pages beside a navigation; this one has no navigation and never
 * scrolls the page.
 */
export function Workbench(props: WorkbenchProps) {
  function cls(): Slots {
    return parts(workbenchStyles({ fill: props.fill }), props.classes);
  }
  function landmark(): boolean {
    return props.landmark ?? (props.fill ?? "viewport") === "viewport";
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="workbench"
      data-fill={props.fill ?? "viewport"}
    >
      <Show when={props.bar !== undefined}>
        <header class={cls().bar} data-slot="workbench-bar">
          {props.bar}
        </header>
      </Show>
      <Show
        when={landmark()}
        fallback={
          <div
            class={cls().main}
            data-slot="workbench-main"
            role={props["aria-label"] === undefined ? undefined : "region"}
            aria-label={props["aria-label"]}
          >
            {props.children}
          </div>
        }
      >
        <main class={cls().main} data-slot="workbench-main" aria-label={props["aria-label"]}>
          {props.children}
        </main>
      </Show>
      <Show when={props.status !== undefined}>
        <footer class={cls().status} data-slot="workbench-status">
          {props.status}
        </footer>
      </Show>
    </div>
  );
}
