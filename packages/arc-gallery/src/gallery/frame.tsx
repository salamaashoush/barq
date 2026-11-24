import { Text } from "@barqjs/arc";
import { edge, elevation, layout, rounded, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { useLocation } from "@barqjs/router";

import { VIEWPORTS, type Viewport } from "./settings.ts";

const gallery = layer("gallery");

const stage = gallery(layout.column, layout.centre, {
  gap: space.x3,
  paddingBlock: space.x4,
});

const device = gallery(edge.all, rounded.xl, elevation.raised, {
  display: "block",
  // The frame's own edge outside the width, so the page inside is exactly the device's.
  boxSizing: "content-box",
  maxWidth: "100%",
  height: "calc(100dvh - var(--spacing) * 36)",
  backgroundColor: "var(--background)",
});

export interface ViewportFrameProps {
  viewport: Exclude<Viewport, "desktop">;
}

/**
 * The page at a device's width, in a frame of its own, so the viewport's
 * media queries answer for that width rather than the window's. The page
 * inside reads the same controls from its address and leaves the shell out.
 */
export function ViewportFrame(props: ViewportFrameProps) {
  const location = useLocation();
  function width(): number {
    return VIEWPORTS.find((each) => each.id === props.viewport)?.width ?? 390;
  }
  function src(): string {
    const search = new URLSearchParams(location().search);
    search.delete("viewport");
    search.set("embed", "1");
    return `${location().pathname}?${search.toString()}${location().hash}`;
  }
  return (
    <div class={stage} data-slot="gallery-frame">
      <Text size="xs" color="muted" mono>
        {props.viewport} · {width()}px
      </Text>
      <iframe
        class={device}
        title={`The page at ${width()} pixels wide`}
        src={src()}
        width={width()}
      />
    </div>
  );
}
