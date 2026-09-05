/**
 * The small outline shapes on the right of a picker's trigger.
 *
 * Every path is copied out of `apps/v4/registry/styles.tsx` and
 * `apps/v4/app/(app)/(create)/components/*-picker.tsx`, because a style is a
 * SHAPE rather than a colour and this is the honest 16px summary of one: vega
 * is a soft square, lyra a hexagon, maia a circle, sera a hard square. A letter
 * or a dot in their place would say nothing true about the choice.
 *
 * `currentColor` throughout, so the glyph follows the trigger's text rather
 * than carrying a colour of its own.
 */

import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

const glyph = ui({
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
});

/** `stroke` only, and the same weight upstream draws every one of them at. */
function Outline(props: Incoming<{ children?: unknown; round?: boolean }>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-hidden="true"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin={props.round?.() === true ? "round" : undefined}
      class={glyph}
    >
      {props.children as never}
    </svg>
  );
}

const STYLE_PATHS: Readonly<Record<string, string>> = {
  vega: "M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z",
  nova: "M2 12C2 9.19974 2 7.79961 2.54497 6.73005C3.02433 5.78924 3.78924 5.02433 4.73005 4.54497C5.79961 4 7.19974 4 10 4H14C16.8003 4 18.2004 4 19.27 4.54497C20.2108 5.02433 20.9757 5.78924 21.455 6.73005C22 7.79961 22 9.19974 22 12C22 14.8003 22 16.2004 21.455 17.27C20.9757 18.2108 20.2108 18.9757 19.27 19.455C18.2004 20 16.8003 20 14 20H10C7.19974 20 5.79961 20 4.73005 19.455C3.78924 18.9757 3.02433 18.2108 2.54497 17.27C2 16.2004 2 14.8003 2 12Z",
  lyra: "M7.84308 3.80211C9.8718 2.6007 10.8862 2 12 2C13.1138 2 14.1282 2.6007 16.1569 3.80211L16.8431 4.20846C18.8718 5.40987 19.8862 6.01057 20.4431 7C21 7.98943 21 9.19084 21 11.5937V12.4063C21 14.8092 21 16.0106 20.4431 17C19.8862 17.9894 18.8718 18.5901 16.8431 19.7915L16.1569 20.1979C14.1282 21.3993 13.1138 22 12 22C10.8862 22 9.8718 21.3993 7.84308 20.1979L7.15692 19.7915C5.1282 18.5901 4.11384 17.9894 3.55692 17C3 16.0106 3 14.8092 3 12.4063V11.5937C3 9.19084 3 7.98943 3.55692 7C4.11384 6.01057 5.1282 5.40987 7.15692 4.20846L7.84308 3.80211Z",
  mira: "M5.92089 5.92089C8.15836 3.68342 9.2771 2.56468 10.5857 2.19562C11.5105 1.93479 12.4895 1.93479 13.4143 2.19562C14.7229 2.56468 15.8416 3.68342 18.0791 5.92089C20.3166 8.15836 21.4353 9.2771 21.8044 10.5857C22.0652 11.5105 22.0652 12.4895 21.8044 13.4143C21.4353 14.7229 20.3166 15.8416 18.0791 18.0791C15.8416 20.3166 14.7229 21.4353 13.4143 21.8044C12.4895 22.0652 11.5105 22.0652 10.5857 21.8044C9.2771 21.4353 8.15836 20.3166 5.92089 18.0791C3.68342 15.8416 2.56468 14.7229 2.19562 13.4143C1.93479 12.4895 1.93479 11.5105 2.19562 10.5857C2.56468 9.2771 3.68342 8.15836 5.92089 5.92089Z",
  luma: "M2 12C2 8.134 5.134 5 9 5H15C18.866 5 22 8.134 22 12C22 15.866 18.866 19 15 19H9C5.134 19 2 15.866 2 12Z",
  rhea: "M3 12C3 9.79086 4.79086 8 7 8H17C19.2091 8 21 9.79086 21 12C21 14.2091 19.2091 16 17 16H7C4.79086 16 3 14.2091 3 12Z",
  none: "M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12Z",
};

const ROUNDED = new Set(["nova", "mira", "luma", "rhea"]);

/** A style's own shape. `maia` is a circle and `sera` a rectangle, so those two are elements. */
export function StyleGlyph(props: Incoming<{ name: string }>) {
  if (props.name() === "maia") {
    return (
      <Outline round>
        <circle cx="12" cy="12" r="10" />
      </Outline>
    );
  }
  if (props.name() === "sera") {
    return (
      <Outline>
        <rect x="3" y="3" width="18" height="18" />
      </Outline>
    );
  }
  return (
    <Outline round={ROUNDED.has(props.name())}>
      <path d={STYLE_PATHS[props.name()] ?? STYLE_PATHS["none"]} />
    </Outline>
  );
}

/**
 * The radius picker's corner, rotated a quarter turn as upstream draws it.
 *
 * The rotation is what turns "a corner at the bottom left" into "a corner at
 * the top right", which is the one a component actually shows you first.
 */
const turned = ui({
  rotate: "90deg",
});

export function RadiusGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-hidden="true"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={ui(glyph, turned)}
    >
      <path d="M4 20v-5C4 8.925 8.925 4 15 4h5" />
    </svg>
  );
}

const letters = ui({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--text-base)",
  lineHeight: "1",
});

/**
 * `Aa`, set in the font it is offering.
 *
 * The point of a font picker is seeing the shape of the letters, so the glyph
 * is the only part of the trigger that changes family: the label beside it
 * stays in the chrome's font, or the row would reflow on every hover.
 */
export function FontGlyph(props: Incoming<{ stack?: string }>) {
  return (
    <span
      class={letters}
      style={{ "font-family": props.stack?.() ?? "inherit" }}
      aria-hidden="true"
    >
      Aa
    </span>
  );
}
