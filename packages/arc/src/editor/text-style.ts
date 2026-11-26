/** The colours text and its highlight are given in, by name. */
export type EditorColour =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export const EDITOR_COLOURS: readonly EditorColour[] = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

/**
 * The colour each name writes on text. Stored as the colour itself, so a
 * document reads the same in any theme and in any other program.
 */
export const TEXT_COLOURS: Readonly<Record<EditorColour, string>> = {
  gray: "#8a8a85",
  brown: "#9f6b53",
  orange: "#d9730d",
  yellow: "#c29316",
  green: "#3f8f5b",
  blue: "#2f7fbf",
  purple: "#8f5fbf",
  pink: "#c14c8a",
  red: "#cf4b45",
};

/** The highlight each name lays behind text, see-through so the text keeps its own colour. */
export const HIGHLIGHT_COLOURS: Readonly<Record<EditorColour, string>> = {
  gray: "#8a8a8533",
  brown: "#9f6b5333",
  orange: "#d9730d33",
  yellow: "#e9b20040",
  green: "#3f8f5b33",
  blue: "#2f7fbf33",
  purple: "#8f5fbf33",
  pink: "#c14c8a33",
  red: "#cf4b4533",
};

/** A size text is given, against the text around it. */
export type TextSize = "small" | "large" | "huge";

export const TEXT_SIZES: Readonly<Record<TextSize, string>> = {
  small: "0.875em",
  large: "1.25em",
  huge: "1.75em",
};

/** One colour as `#rrggbb`, or nothing for a transparent one. */
function normaliseColour(value: string): string | null {
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgb === null) return /^#[\da-f]{3,8}$/i.test(value) ? value.toLowerCase() : null;
  const alpha =
    rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]) / (rgb[4].endsWith("%") ? 100 : 1);
  if (alpha === 0) return null;
  return `#${[rgb[1], rgb[2], rgb[3]].map((one) => Number(one).toString(16).padStart(2, "0")).join("")}`;
}

/** The font sizes kept: an em of the text around, or pixels within reason. */
function normaliseSize(value: string): string | null {
  const size = /^([\d.]+)(px|em|rem)$/.exec(value);
  if (size === null) return null;
  const amount = Number(size[1]);
  if (size[2] === "px") return amount >= 8 && amount <= 96 ? value : null;
  return amount >= 0.5 && amount <= 4 ? `${String(amount)}em` : null;
}

/**
 * A pasted style kept to what a document draws: its colour, its highlight,
 * its size and its first font. Everything else a page or a word processor
 * brings (margins, line heights, positions) is dropped.
 */
export function sanitiseStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const at = declaration.indexOf(":");
    if (at < 0) continue;
    const property = declaration.slice(0, at).trim().toLowerCase();
    const raw = declaration.slice(at + 1).trim();
    const value =
      property === "color" || property === "background-color"
        ? normaliseColour(raw)
        : property === "font-size"
          ? normaliseSize(raw)
          : property === "font-family"
            ? (raw.split(",")[0]?.trim() ?? null)
            : null;
    if (value !== null && value !== "") kept.push(`${property}: ${value}`);
  }
  return kept.join("; ");
}
