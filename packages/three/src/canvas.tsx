/** @jsxImportSource @barqjs/web */
/**
 * `<Canvas>`: the component a page renders a scene with.
 *
 * It is a component of the document, compiled with the page, so on the server
 * it is a `<div>` holding a `<canvas>` and touches nothing of three. In the
 * browser the canvas's `ref` mounts the scene: a root over the canvas, sized
 * to the `<div>`, whose scene renders the children through this package's
 * renderer. The children are built under the Canvas's owner, so they read the
 * page's contexts as well as the root's state.
 */

import {
  createRenderEffect,
  getOwner,
  onCleanup,
  untrack,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import type { JSX } from "@barqjs/web/jsx-runtime";

import type { EventManager, EventPrefix } from "./events.ts";
import { createRoot, type RootConfig } from "./renderer.ts";
import type { RootState } from "./store.ts";

/** What `style` takes on a `<div>`: a string, or an object of properties. */
export type CanvasStyle = Exclude<
  JSX.IntrinsicElements["div"]["style"],
  undefined | ((...args: never[]) => unknown)
>;

export interface CanvasProps extends Omit<
  RootConfig,
  "size" | "events" | "onCreated" | "eventPrefix"
> {
  children?: JSXElement;
  /** A custom event manager, in place of pointer events on `eventSource`. */
  events?: (store: RootState) => EventManager<HTMLElement>;
  /** The element pointer events are read from. Defaults to the Canvas's own `<div>`. */
  eventSource?: HTMLElement | { current: HTMLElement | null };
  /** Which coordinates of a pointer event are read: `offset` by default. */
  eventPrefix?: EventPrefix;
  /** Called once the renderer exists and the first frame is asked for. */
  onCreated?: (state: RootState) => void;
  style?: CanvasStyle;
  class?: string;
  id?: string;
}

const CONFIG_KEYS = [
  "gl",
  "shadows",
  "legacy",
  "linear",
  "flat",
  "orthographic",
  "frameloop",
  "performance",
  "dpr",
  "raycaster",
  "scene",
  "camera",
  "onPointerMissed",
  "events",
  "eventPrefix",
] as const;

function sourceOf(source: CanvasProps["eventSource"]): HTMLElement | null {
  if (source === undefined) return null;
  if ("current" in source && !(source instanceof HTMLElement)) return source.current;
  return source;
}

export function Canvas(props: Incoming<CanvasProps>): JSXElement {
  const owner = getOwner();

  const read = (): RootConfig => {
    const config: Record<string, unknown> = {};
    for (const key of CONFIG_KEYS) {
      const cell = props[key] as (() => unknown) | undefined;
      if (cell !== undefined) config[key] = cell();
    }
    return config;
  };

  const mount = (canvas: HTMLCanvasElement): void => {
    const wrapper = canvas.parentElement!.parentElement!;
    const root = createRoot(canvas);
    const created = (state: RootState): void => {
      const source = sourceOf(untrack(() => props.eventSource?.())) ?? wrapper;
      state.events.connect?.(source);
      untrack(() => props.onCreated?.())?.(state);
    };
    const configure = (config: RootConfig): void => {
      root.configure({ ...config, onCreated: created });
    };
    configure(untrack(read));
    let first = true;
    createRenderEffect(read, (config) => {
      if (first) {
        first = false;
        return;
      }
      configure(config);
    });

    const measure = (): void => {
      const rect = wrapper.getBoundingClientRect();
      const size = root.store.size;
      if (
        rect.width === size.width &&
        rect.height === size.height &&
        rect.top === size.top &&
        rect.left === size.left
      ) {
        return;
      }
      root.store.setSize(rect.width, rect.height, rect.top, rect.left);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(wrapper);
    measure();
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });

    root.render(() => props.children as unknown as JSXElement, { owner });

    onCleanup(() => {
      observer?.disconnect();
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      root.unmount();
    });
  };

  const style = (): CanvasStyle => {
    const events = props.eventSource?.() === undefined ? "auto" : "none";
    const own = props.style?.();
    if (typeof own === "string") {
      return `position:relative;width:100%;height:100%;overflow:hidden;pointer-events:${events};${own}`;
    }
    return {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      "pointer-events": events,
      ...own,
    };
  };

  return (
    <div id={props.id?.()} class={props.class?.()} style={style()}>
      <div style={{ width: "100%", height: "100%" }}>
        <canvas ref={mount} style={{ display: "block" }} />
      </div>
    </div>
  );
}
