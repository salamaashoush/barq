import type { Child } from "@barqjs/core";

interface GlyphProps {
  children?: Child;
  flip?: boolean;
  fill?: boolean;
}

/**
 * The editor's own drawings: the properties panel's choices, which are
 * pictures of a stroke, a fill or an arrowhead rather than symbols any icon
 * set has. Drawn on a 20 unit grid in the current colour.
 */
function Glyph(props: GlyphProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill={props.fill === true ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style={props.flip === true ? "transform:scaleX(-1)" : undefined}
    >
      {props.children}
    </svg>
  );
}

export function StrokeWidthThin() {
  return (
    <Glyph>
      <path d="M4 10h12" stroke-width="1.25" />
    </Glyph>
  );
}
export function StrokeWidthBold() {
  return (
    <Glyph>
      <path d="M4 10h12" stroke-width="2.5" />
    </Glyph>
  );
}
export function StrokeWidthExtraBold() {
  return (
    <Glyph>
      <path d="M4 10h12" stroke-width="3.75" />
    </Glyph>
  );
}
export function StrokeStyleSolid() {
  return (
    <Glyph>
      <path d="M4 10h12" stroke-width="2" />
    </Glyph>
  );
}
export function StrokeStyleDashed() {
  return (
    <Glyph>
      <path d="M4 10h12" stroke-width="2" stroke-dasharray="4 3" />
    </Glyph>
  );
}
export function StrokeStyleDotted() {
  return (
    <Glyph>
      <path d="M4 10h12" stroke-width="2" stroke-dasharray="0.5 3.5" />
    </Glyph>
  );
}
export function SloppinessArchitect() {
  return (
    <Glyph>
      <path d="M3 13c3-1 5-6 7-6s4 5 7 6" />
    </Glyph>
  );
}
export function SloppinessArtist() {
  return (
    <Glyph>
      <path d="M3 13c3-1 5-6 7-6s4 5 7 6" />
      <path d="M3 14c3-2 5-6 7-6s4 4 7 5" stroke-width="1" />
    </Glyph>
  );
}
export function SloppinessCartoonist() {
  return (
    <Glyph>
      <path d="M3 13c2-1 4-7 7-6 2 0 3 6 7 6" />
      <path d="M3 15c3-3 4-6 7-7s4 6 7 5" stroke-width="1" />
      <path d="M4 12c3 0 4-6 6-5s4 4 6 6" stroke-width="0.75" />
    </Glyph>
  );
}
export function FillHachure() {
  return (
    <Glyph>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 9l6-6M3 15L15 3M7 17L17 7M13 17l4-4" stroke-width="1" />
    </Glyph>
  );
}
export function FillZigZag() {
  return (
    <Glyph>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 9l6-6 0 4-6 6zM7 17L17 7" stroke-width="1" />
    </Glyph>
  );
}
export function FillCrossHatch() {
  return (
    <Glyph>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 9l6-6M3 15L15 3M7 17L17 7M3 11l6 6M3 5l12 12M7 3l10 10" stroke-width="1" />
    </Glyph>
  );
}
export function FillSolid() {
  return (
    <Glyph>
      <rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" />
    </Glyph>
  );
}
export function EdgeSharp() {
  return (
    <Glyph>
      <path d="M4 16V4h12" />
    </Glyph>
  );
}
export function EdgeRound() {
  return (
    <Glyph>
      <path d="M4 16V9a5 5 0 0 1 5-5h7" />
    </Glyph>
  );
}
export function ArrowSharp() {
  return (
    <Glyph>
      <path d="M4 16l12-12M10 4h6v6" />
    </Glyph>
  );
}
export function ArrowRound() {
  return (
    <Glyph>
      <path d="M4 16c0-8 4-12 12-12M11 3l5 1-1 5" />
    </Glyph>
  );
}
export function ArrowElbow() {
  return (
    <Glyph>
      <path d="M4 16v-6h12M12 6l4 4-4 4" />
    </Glyph>
  );
}
export function FontSizeSmall() {
  return <TextGlyph letter="S" />;
}
export function FontSizeMedium() {
  return <TextGlyph letter="M" />;
}
export function FontSizeLarge() {
  return <TextGlyph letter="L" />;
}
export function FontSizeExtraLarge() {
  return <TextGlyph letter="XL" />;
}

interface TextGlyphProps {
  letter: string;
}

function TextGlyph(props: TextGlyphProps) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <text
        x="10"
        y="14.5"
        text-anchor="middle"
        font-size={props.letter.length > 1 ? "10" : "12"}
        font-weight="600"
        fill="currentColor"
        font-family="system-ui, sans-serif"
      >
        {props.letter}
      </text>
    </svg>
  );
}

export function PressureConstant() {
  return (
    <Glyph>
      <path d="M3 12c3-4 5-4 7 0s4 4 7 0" stroke-width="2" />
    </Glyph>
  );
}
export function PressureVariable() {
  return (
    <Glyph>
      <path d="M3 12c3-4 5-4 7 0s4 4 7 0" stroke-width="1" />
      <path d="M8 11c1 1 2 3 3 3" stroke-width="3" />
    </Glyph>
  );
}
export function Polygon() {
  return (
    <Glyph>
      <path d="M10 3l7 5-3 9H6L3 8z" />
    </Glyph>
  );
}

export type ArrowheadGlyph =
  | "none"
  | "arrow"
  | "triangle"
  | "triangle_outline"
  | "circle"
  | "circle_outline"
  | "diamond"
  | "diamond_outline"
  | "bar"
  | "cardinality_one"
  | "cardinality_many"
  | "cardinality_one_or_many"
  | "cardinality_exactly_one"
  | "cardinality_zero_or_one"
  | "cardinality_zero_or_many";

const ARROWHEAD_PATHS: Record<ArrowheadGlyph, () => Child> = {
  none: () => <path d="M3 10h14" />,
  arrow: () => <path d="M3 10h14M12 5l5 5-5 5" />,
  triangle: () => (
    <>
      <path d="M3 10h9" />
      <path d="M11 5l6 5-6 5z" fill="currentColor" />
    </>
  ),
  triangle_outline: () => <path d="M3 10h8M11 5l6 5-6 5z" />,
  circle: () => (
    <>
      <path d="M3 10h9" />
      <circle cx="14" cy="10" r="3" fill="currentColor" />
    </>
  ),
  circle_outline: () => (
    <>
      <path d="M3 10h8" />
      <circle cx="14" cy="10" r="3" />
    </>
  ),
  diamond: () => (
    <>
      <path d="M3 10h7" />
      <path d="M10 10l3.5-3.5L17 10l-3.5 3.5z" fill="currentColor" />
    </>
  ),
  diamond_outline: () => <path d="M3 10h7M10 10l3.5-3.5L17 10l-3.5 3.5z" />,
  bar: () => <path d="M3 10h14M17 5v10" />,
  cardinality_one: () => <path d="M3 10h14M14 5v10" />,
  cardinality_many: () => <path d="M3 10h14M12 10l5-5M12 10l5 5" />,
  cardinality_one_or_many: () => <path d="M3 10h14M12 10l5-5M12 10l5 5M10 5v10" />,
  cardinality_exactly_one: () => <path d="M3 10h14M13 5v10M10 5v10" />,
  cardinality_zero_or_one: () => (
    <>
      <path d="M3 10h4M10 10h7M14 5v10" />
      <circle cx="8.5" cy="10" r="1.75" />
    </>
  ),
  cardinality_zero_or_many: () => (
    <>
      <path d="M3 10h4M10 10h7M12 10l5-5M12 10l5 5" />
      <circle cx="8.5" cy="10" r="1.75" />
    </>
  ),
};

export interface ArrowheadProps {
  type: ArrowheadGlyph;
  flip: boolean;
}

/** An arrowhead at the end of a line; `flip` draws it at the start. */
export function Arrowhead(props: ArrowheadProps) {
  return <Glyph flip={props.flip}>{ARROWHEAD_PATHS[props.type]()}</Glyph>;
}
