/**
 * Colours as values, in every space a picker or a design system edits.
 *
 * A colour picker is not one control but several, and each edits a different
 * SPACE: a saturation/brightness area is HSB, a hue wheel is HSL, a hex field
 * is RGB, and a design system's tokens are OKLCH, `oklch(0.63 0.26 29)`,
 * because its lightness is the same for every hue at the same perceived
 * brightness. So a colour converts between all of them without drifting:
 *
 * - **Two families of space.** RGB, HSL, HSB and HWB are the sRGB cube in
 *   four coordinate systems. CIE Lab and LCH and OKLab and OKLCH are
 *   perceptual, and wider than sRGB: they hold colours no sRGB screen shows.
 *   Conversions between the families go through CIE XYZ, with CSS Color 4's
 *   own sample code and matrices, so a colour here is the colour a browser
 *   draws for the same CSS.
 * - **Hue survives a round trip through grey.** Converting `hsb(210, 0%, 50%)`
 *   to RGB loses the hue, since every grey is the same three numbers, and back
 *   again would answer 0. So a conversion carries the hue rather than
 *   recomputing it, in every space that has one, and dragging saturation or
 *   chroma to zero and back does not spin the wheel to red.
 * - **Out of gamut is mapped, not clipped.** `oklch(0.7 0.4 30)` has no sRGB
 *   value. Clipping each channel shifts its hue and lightness; CSS Color 4's
 *   gamut mapping lowers the chroma in OKLCH until the colour fits within a
 *   just noticeable difference, which is what a browser shows for it. Hex,
 *   `rgb()` and the sRGB spaces get that colour.
 * - **A channel's range belongs to its space.** A hue is 0 to 360 and wraps,
 *   in every space that has one. Lightness is 0 to 100 in HSL and Lab but 0 to
 *   1 in OKLCH, which is how CSS writes each, so a channel is looked up in the
 *   colour's own space, and one the space lacks in the nearest space that has
 *   it: a Lab colour's hue is its LCH hue, not its HSL one.
 * - **A colour is immutable.** `withChannelValue` answers a new one, so a
 *   drag can hold the colour it started from and compare by content.
 */

import { StringDictionary, StringFormatter } from "./i18n.ts";

export type ColorSpace = "rgb" | "hsl" | "hsb" | "hwb" | "lab" | "lch" | "oklab" | "oklch";

/**
 * A channel, by what it means.
 *
 * Lab's and OKLab's a and b axes are `greenRed` and `blueYellow`, the two
 * opponent axes they measure, negative to positive. Not `a` and `b`: CSS's
 * relative colour syntax already gives `b` to blue in `rgb()`, and a channel
 * named `b` beside one named `blue` invites reading one as the other.
 */
export type ColorChannel =
  | "hue"
  | "saturation"
  | "brightness"
  | "lightness"
  | "whiteness"
  | "blackness"
  | "chroma"
  | "red"
  | "green"
  | "blue"
  | "greenRed"
  | "blueYellow"
  | "alpha";

export type ColorFormat =
  | "hex"
  | "hexa"
  | "rgb"
  | "rgba"
  | "hsl"
  | "hsla"
  | "hsb"
  | "hsba"
  | "hwb"
  | "lab"
  | "lch"
  | "oklab"
  | "oklch";

export interface ColorChannelRange {
  minValue: number;
  maxValue: number;
  step: number;
  /** How far Page Up and Page Down move. */
  pageSize: number;
}

type Triple = [number, number, number];
type Channels = [ColorChannel, ColorChannel, ColorChannel];

interface ChannelSpec {
  range: ColorChannelRange;
  format: Intl.NumberFormatOptions;
}

const DEGREES: Intl.NumberFormatOptions = { style: "unit", unit: "degree", unitDisplay: "narrow" };
const PERCENT: Intl.NumberFormatOptions = { style: "percent" };

const HUE: ChannelSpec = {
  range: { minValue: 0, maxValue: 360, step: 1, pageSize: 15 },
  format: DEGREES,
};
const SHARE: ChannelSpec = {
  range: { minValue: 0, maxValue: 100, step: 1, pageSize: 10 },
  format: PERCENT,
};
const BYTE: ChannelSpec = {
  range: { minValue: 0, maxValue: 255, step: 1, pageSize: 17 },
  format: { style: "decimal" },
};
const ALPHA: ChannelSpec = {
  range: { minValue: 0, maxValue: 1, step: 0.01, pageSize: 0.1 },
  format: PERCENT,
};

// The perceptual spaces step a tenth of a percent of lightness, finer than
// HSL's whole percent: design tokens are written to three decimals,
// `oklch(0.922 0 0)`, and a field that snapped them to two would change a
// token by being tabbed through. Page Up and Down make the coarse moves.
const PERCEPTUAL_LIGHTNESS: ChannelSpec = {
  range: { minValue: 0, maxValue: 100, step: 0.1, pageSize: 5 },
  format: { style: "percent", maximumFractionDigits: 1 },
};
const OK_LIGHTNESS: ChannelSpec = {
  range: { minValue: 0, maxValue: 1, step: 0.001, pageSize: 0.05 },
  format: { style: "percent", maximumFractionDigits: 1 },
};
// Where 100% lands in CSS: 125 for Lab's axes, 150 for LCH's chroma, 0.4 for
// OKLab's and OKLCH's. Past it are colours no display shows.
const LAB_AXIS: ChannelSpec = {
  range: { minValue: -125, maxValue: 125, step: 0.1, pageSize: 5 },
  format: { style: "decimal", maximumFractionDigits: 1 },
};
const LCH_CHROMA: ChannelSpec = {
  range: { minValue: 0, maxValue: 150, step: 0.1, pageSize: 5 },
  format: { style: "decimal", maximumFractionDigits: 1 },
};
const OK_AXIS: ChannelSpec = {
  range: { minValue: -0.4, maxValue: 0.4, step: 0.001, pageSize: 0.02 },
  format: { style: "decimal", maximumFractionDigits: 3 },
};
const OK_CHROMA: ChannelSpec = {
  range: { minValue: 0, maxValue: 0.4, step: 0.001, pageSize: 0.02 },
  format: { style: "decimal", maximumFractionDigits: 3 },
};

interface SpaceSpec {
  channels: Channels;
  specs: Partial<Record<ColorChannel, ChannelSpec>>;
}

const SPACES: Record<ColorSpace, SpaceSpec> = {
  rgb: { channels: ["red", "green", "blue"], specs: { red: BYTE, green: BYTE, blue: BYTE } },
  hsl: {
    channels: ["hue", "saturation", "lightness"],
    specs: { hue: HUE, saturation: SHARE, lightness: SHARE },
  },
  hsb: {
    channels: ["hue", "saturation", "brightness"],
    specs: { hue: HUE, saturation: SHARE, brightness: SHARE },
  },
  hwb: {
    channels: ["hue", "whiteness", "blackness"],
    specs: { hue: HUE, whiteness: SHARE, blackness: SHARE },
  },
  lab: {
    channels: ["lightness", "greenRed", "blueYellow"],
    specs: { lightness: PERCEPTUAL_LIGHTNESS, greenRed: LAB_AXIS, blueYellow: LAB_AXIS },
  },
  lch: {
    channels: ["lightness", "chroma", "hue"],
    specs: { lightness: PERCEPTUAL_LIGHTNESS, chroma: LCH_CHROMA, hue: HUE },
  },
  oklab: {
    channels: ["lightness", "greenRed", "blueYellow"],
    specs: { lightness: OK_LIGHTNESS, greenRed: OK_AXIS, blueYellow: OK_AXIS },
  },
  oklch: {
    channels: ["lightness", "chroma", "hue"],
    specs: { lightness: OK_LIGHTNESS, chroma: OK_CHROMA, hue: HUE },
  },
};

/**
 * Where a channel the colour's own space lacks is read, nearest first.
 *
 * The other half of a pair before anything else, so a Lab colour's chroma is
 * its LCH chroma and an OKLCH colour's `greenRed` its OKLab one; among the
 * sRGB spaces, saturation and lightness are HSL's, as they always were.
 */
const NEIGHBOURS: Record<ColorSpace, ColorSpace[]> = {
  rgb: ["hsl", "hsb", "hwb", "oklch", "oklab"],
  hsl: ["hsb", "rgb", "hwb", "oklch", "oklab"],
  hsb: ["hsl", "rgb", "hwb", "oklch", "oklab"],
  hwb: ["hsl", "hsb", "rgb", "oklch", "oklab"],
  lab: ["lch", "rgb", "hsl", "hsb", "hwb", "oklch"],
  lch: ["lab", "rgb", "hsl", "hsb", "hwb", "oklab"],
  oklab: ["oklch", "rgb", "hsl", "hsb", "hwb", "lch"],
  oklch: ["oklab", "rgb", "hsl", "hsb", "hwb", "lch"],
};

/** The space a channel is read in, for a colour in `space`. */
function homeOf(space: ColorSpace, channel: ColorChannel): ColorSpace {
  if (SPACES[space].channels.includes(channel)) return space;
  return NEIGHBOURS[space].find((other) => SPACES[other].channels.includes(channel)) ?? space;
}

function specOf(space: ColorSpace, channel: ColorChannel): ChannelSpec {
  if (channel === "alpha") return ALPHA;
  const spec = SPACES[homeOf(space, channel)].specs[channel];
  if (spec === undefined) throw new RangeError(`Not a colour channel: ${channel}`);
  return spec;
}

const FORMAT_SPACE: Record<ColorFormat, ColorSpace> = {
  hex: "rgb",
  hexa: "rgb",
  rgb: "rgb",
  rgba: "rgb",
  hsl: "hsl",
  hsla: "hsl",
  hsb: "hsb",
  hsba: "hsb",
  hwb: "hwb",
  lab: "lab",
  lch: "lch",
  oklab: "oklab",
  oklch: "oklch",
};

function message(
  key: ColorStringKey,
  locale: string,
  variables: Record<string, string> = {},
): string {
  return new StringFormatter(locale, STRINGS)
    .format(key)
    .replace(/\{(\w+)\}/g, (whole, name: string) => variables[name] ?? whole);
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatNumber(value: number, locale: string, options: Intl.NumberFormatOptions): string {
  const key = `${locale} ${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, options);
    formatters.set(key, format);
  }
  return format.format(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, places = 0): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** An angle in [0, 360): a hue is an angle, and 370 is 10. */
function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function alphaSuffix(alpha: number): string {
  return alpha < 1 ? ` / ${round(alpha, 2)}` : "";
}

/** A colour, in whichever space it was written in. */
export abstract class Color {
  abstract readonly alpha: number;
  abstract getColorSpace(): ColorSpace;
  abstract toString(format?: ColorFormat | "css"): string;
  /** One of the colour's own three channels. */
  protected abstract own(channel: ColorChannel): number;

  /**
   * The hue a conversion hands on when its result is a grey, which has none
   * of its own. A colour with a hue channel hands on that; RGB, Lab and OKLab
   * colours carry the one they were converted from.
   */
  get sourceHue(): number {
    return SPACES[this.getColorSpace()].channels.includes("hue") ? this.own("hue") : 0;
  }

  getColorChannels(): Channels {
    const [first, second, third] = SPACES[this.getColorSpace()].channels;
    return [first, second, third];
  }

  toFormat(format: ColorFormat): Color {
    return convert(this, FORMAT_SPACE[format]);
  }

  getChannelValue(channel: ColorChannel): number {
    if (channel === "alpha") return this.alpha;
    const space = this.getColorSpace();
    if (SPACES[space].channels.includes(channel)) return this.own(channel);
    return this.toFormat(homeOf(space, channel)).getChannelValue(channel);
  }

  withChannelValue(channel: ColorChannel, value: number): Color {
    const space = this.getColorSpace();
    const range = this.getChannelRange(channel);
    // Wraps rather than clamps: a hue is an angle, and 370 is 10.
    const next = channel === "hue" ? value : clamp(value, range.minValue, range.maxValue);
    const values = coordinates(this);
    if (channel === "alpha") return make(space, values, next, this.sourceHue);
    const at = SPACES[space].channels.indexOf(channel);
    if (at === -1) {
      return this.toFormat(homeOf(space, channel)).withChannelValue(channel, next).toFormat(space);
    }
    values[at] = next;
    return make(space, values, this.alpha, this.sourceHue);
  }

  /**
   * The space this colour reads a channel in: its own when it has the
   * channel, else the nearest that does. Alpha is in every space.
   */
  getChannelSpace(channel: ColorChannel): ColorSpace {
    return channel === "alpha" ? this.getColorSpace() : homeOf(this.getColorSpace(), channel);
  }

  getChannelRange(channel: ColorChannel): ColorChannelRange {
    return specOf(this.getColorSpace(), channel).range;
  }

  getChannelName(channel: ColorChannel, locale = "en-US"): string {
    return message(channel, locale);
  }

  /** How the channel's number is written for a person: `210°`, `25%`, `170`. */
  getChannelFormatOptions(channel: ColorChannel): Intl.NumberFormatOptions {
    return specOf(this.getColorSpace(), channel).format;
  }

  /**
   * The channel's number as a person reads it, in a locale.
   *
   * A percent channel held on a 0 to 100 scale is a fraction to the
   * formatter, or a saturation of 25 would read as "2,500%".
   */
  formatChannelValue(channel: ColorChannel, locale = "en-US"): string {
    const options = this.getChannelFormatOptions(channel);
    const value = this.getChannelValue(channel);
    const scale =
      options.style === "percent" && this.getChannelRange(channel).maxValue === 100 ? 100 : 1;
    return formatNumber(value / scale, locale, options);
  }

  /**
   * What the colour is called, in words: "dark vibrant blue", "pale yellow".
   *
   * Worked out in OKLCH rather than in HSL, because OKLCH lightness is the same
   * for every hue at the same perceived brightness: HSL calls pure yellow and
   * pure blue equally light, and nobody looking at them would.
   */
  getColorName(locale = "en-US"): string {
    const [perceived, chroma, hue] = oklchOf(this);
    if (perceived > 0.999) return message("white", locale);
    if (perceived < 0.001) return message("black", locale);

    const [hueName, lightness] = oklchHueName(perceived, chroma, hue, locale);

    let chromaWord: ColorStringKey | undefined;
    if (chroma <= 0.1 && chroma >= GRAY_THRESHOLD)
      chromaWord = lightness >= 0.7 ? "pale" : "grayish";
    else if (chroma >= 0.15) chromaWord = "vibrant";

    let lightnessWord: ColorStringKey | undefined;
    if (lightness < 0.3) lightnessWord = "very dark";
    else if (lightness < MAX_DARK_LIGHTNESS) lightnessWord = "dark";
    else if (lightness >= 0.85) lightnessWord = "very light";
    else if (lightness >= 0.7) lightnessWord = "light";

    const variables = {
      lightness: lightnessWord === undefined ? "" : message(lightnessWord, locale),
      chroma: chromaWord === undefined ? "" : message(chromaWord, locale),
      hue: hueName,
      percentTransparent: formatNumber(1 - this.alpha, locale, PERCENT),
    };
    return message(this.alpha < 1 ? "transparentColorName" : "colorName", locale, variables)
      .replace(/\s+/g, " ")
      .trim();
  }

  /** What the hue alone is called: "cyan blue", or "gray" when there is none. */
  getHueName(locale = "en-US"): string {
    const [lightness, chroma, hue] = oklchOf(this);
    return oklchHueName(lightness, chroma, hue, locale)[0];
  }

  /** The colour as a 24-bit integer, for a canvas or a comparison. Mapped into sRGB first. */
  toHexInt(): number {
    const rgb = this.toFormat("rgb");
    return (
      (rgb.getChannelValue("red") << 16) |
      (rgb.getChannelValue("green") << 8) |
      rgb.getChannelValue("blue")
    );
  }

  /**
   * Whether two colours are the same colour, whatever they were written in.
   *
   * Between sRGB spaces, the same 8-bit colour is the same colour, as it
   * always was. A perceptual colour can be finer than that, or outside sRGB
   * where many colours map to one, so there the test is a distance in OKLab
   * well under what an eye or the channel's step can tell apart.
   */
  isEqual(other: Color): boolean {
    if (isSrgbSpace(this.getColorSpace()) && isSrgbSpace(other.getColorSpace())) {
      return this.toString("rgba") === other.toString("rgba");
    }
    return (
      round(this.alpha, 2) === round(other.alpha, 2) &&
      deltaEOK(oklabOf(this), oklabOf(other)) < SAME_COLOR
    );
  }
}

/** Below a tenth of the finest OKLab step a channel takes. */
const SAME_COLOR = 0.0002;

function coordinates(color: Color): Triple {
  const [first, second, third] = color.getColorChannels();
  return [
    color.getChannelValue(first),
    color.getChannelValue(second),
    color.getChannelValue(third),
  ];
}

function make(
  space: ColorSpace,
  [first, second, third]: Triple,
  alpha: number,
  hue: number,
): Color {
  switch (space) {
    case "rgb":
      return new RGBColor(first, second, third, alpha, hue);
    case "hsl":
      return new HSLColor(first, second, third, alpha);
    case "hsb":
      return new HSBColor(first, second, third, alpha);
    case "hwb":
      return new HWBColor(first, second, third, alpha);
    case "lab":
      return new LabColor(first, second, third, alpha, hue);
    case "lch":
      return new LCHColor(first, second, third, alpha);
    case "oklab":
      return new OKLabColor(first, second, third, alpha, hue);
    default:
      return new OKLCHColor(first, second, third, alpha);
  }
}

// ---------------------------------------------------------------------------
// The spaces
// ---------------------------------------------------------------------------

export class RGBColor extends Color {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  /**
   * The hue this colour came from, when it came from one.
   *
   * A grey has no hue to recover, since 0, 0, 0 is every hue at once, so a
   * conversion out of a space with a hue carries it, and dragging saturation
   * to zero and back does not spin the wheel to red.
   */
  readonly #hue: number;

  constructor(red: number, green: number, blue: number, alpha = 1, hue = 0) {
    super();
    this.red = clamp(Math.round(red), 0, 255);
    this.green = clamp(Math.round(green), 0, 255);
    this.blue = clamp(Math.round(blue), 0, 255);
    this.alpha = clamp(alpha, 0, 1);
    this.#hue = hue;
  }

  override get sourceHue(): number {
    return this.#hue;
  }

  getColorSpace(): ColorSpace {
    return "rgb";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "red") return this.red;
    return channel === "green" ? this.green : this.blue;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    switch (format) {
      case "hex":
        return `#${hex(this.red)}${hex(this.green)}${hex(this.blue)}`;
      case "hexa":
        return `#${hex(this.red)}${hex(this.green)}${hex(this.blue)}${hex(
          Math.round(this.alpha * 255),
        )}`;
      case "rgb":
        return `rgb(${this.red}, ${this.green}, ${this.blue})`;
      case "css":
      case "rgba":
        return `rgba(${this.red}, ${this.green}, ${this.blue}, ${round(this.alpha, 2)})`;
      default:
        return this.toFormat(format).toString(format);
    }
  }
}

export class HSLColor extends Color {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  readonly alpha: number;

  constructor(hue: number, saturation: number, lightness: number, alpha = 1) {
    super();
    this.hue = wrapHue(hue);
    this.saturation = clamp(saturation, 0, 100);
    this.lightness = clamp(lightness, 0, 100);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "hsl";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "hue") return this.hue;
    return channel === "saturation" ? this.saturation : this.lightness;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    switch (format) {
      case "hsl":
        return `hsl(${round(this.hue, 2)}, ${round(this.saturation, 2)}%, ${round(this.lightness, 2)}%)`;
      case "css":
      case "hsla":
        return `hsla(${round(this.hue, 2)}, ${round(this.saturation, 2)}%, ${round(this.lightness, 2)}%, ${round(this.alpha, 2)})`;
      default:
        return this.toFormat(format).toString(format);
    }
  }
}

export class HSBColor extends Color {
  readonly hue: number;
  readonly saturation: number;
  readonly brightness: number;
  readonly alpha: number;

  constructor(hue: number, saturation: number, brightness: number, alpha = 1) {
    super();
    this.hue = wrapHue(hue);
    this.saturation = clamp(saturation, 0, 100);
    this.brightness = clamp(brightness, 0, 100);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "hsb";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "hue") return this.hue;
    return channel === "saturation" ? this.saturation : this.brightness;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    switch (format) {
      case "hsb":
        return `hsb(${round(this.hue, 2)}, ${round(this.saturation, 2)}%, ${round(this.brightness, 2)}%)`;
      case "hsba":
        return `hsba(${round(this.hue, 2)}, ${round(this.saturation, 2)}%, ${round(this.brightness, 2)}%, ${round(this.alpha, 2)})`;
      // `hsb` is not a CSS colour function, so the CSS form is the HSL one.
      case "css":
        return this.toFormat("hsla").toString("hsla");
      default:
        return this.toFormat(format).toString(format);
    }
  }
}

/** Hue, whiteness and blackness: a hue with white and black mixed in. */
export class HWBColor extends Color {
  readonly hue: number;
  readonly whiteness: number;
  readonly blackness: number;
  readonly alpha: number;

  constructor(hue: number, whiteness: number, blackness: number, alpha = 1) {
    super();
    this.hue = wrapHue(hue);
    this.whiteness = clamp(whiteness, 0, 100);
    this.blackness = clamp(blackness, 0, 100);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "hwb";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "hue") return this.hue;
    return channel === "whiteness" ? this.whiteness : this.blackness;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    if (format !== "hwb" && format !== "css") return this.toFormat(format).toString(format);
    return `hwb(${round(this.hue, 2)} ${round(this.whiteness, 2)}% ${round(this.blackness, 2)}%${alphaSuffix(this.alpha)})`;
  }
}

/** CIE Lab, relative to D50: lightness 0 to 100 and two opponent axes. */
export class LabColor extends Color {
  readonly lightness: number;
  /** a: negative is green, positive red. */
  readonly greenRed: number;
  /** b: negative is blue, positive yellow. */
  readonly blueYellow: number;
  readonly alpha: number;
  readonly #hue: number;

  constructor(lightness: number, greenRed: number, blueYellow: number, alpha = 1, hue = 0) {
    super();
    // CSS clamps lightness at parse time; the axes are unbounded.
    this.lightness = clamp(lightness, 0, 100);
    this.greenRed = greenRed;
    this.blueYellow = blueYellow;
    this.alpha = clamp(alpha, 0, 1);
    this.#hue = hue;
  }

  override get sourceHue(): number {
    return this.#hue;
  }

  getColorSpace(): ColorSpace {
    return "lab";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "lightness") return this.lightness;
    return channel === "greenRed" ? this.greenRed : this.blueYellow;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    if (format !== "lab" && format !== "css") return this.toFormat(format).toString(format);
    return `lab(${round(this.lightness, 3)} ${round(this.greenRed, 3)} ${round(this.blueYellow, 3)}${alphaSuffix(this.alpha)})`;
  }
}

/** CIE LCH: Lab in polar form, chroma and hue in place of the two axes. */
export class LCHColor extends Color {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
  readonly alpha: number;

  constructor(lightness: number, chroma: number, hue: number, alpha = 1) {
    super();
    this.lightness = clamp(lightness, 0, 100);
    this.chroma = Math.max(chroma, 0);
    this.hue = wrapHue(hue);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "lch";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "lightness") return this.lightness;
    return channel === "chroma" ? this.chroma : this.hue;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    if (format !== "lch" && format !== "css") return this.toFormat(format).toString(format);
    return `lch(${round(this.lightness, 3)} ${round(this.chroma, 3)} ${round(this.hue, 3)}${alphaSuffix(this.alpha)})`;
  }
}

/** OKLab, relative to D65: lightness 0 to 1 and two opponent axes. */
export class OKLabColor extends Color {
  readonly lightness: number;
  /** a: negative is green, positive red. */
  readonly greenRed: number;
  /** b: negative is blue, positive yellow. */
  readonly blueYellow: number;
  readonly alpha: number;
  readonly #hue: number;

  constructor(lightness: number, greenRed: number, blueYellow: number, alpha = 1, hue = 0) {
    super();
    this.lightness = clamp(lightness, 0, 1);
    this.greenRed = greenRed;
    this.blueYellow = blueYellow;
    this.alpha = clamp(alpha, 0, 1);
    this.#hue = hue;
  }

  override get sourceHue(): number {
    return this.#hue;
  }

  getColorSpace(): ColorSpace {
    return "oklab";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "lightness") return this.lightness;
    return channel === "greenRed" ? this.greenRed : this.blueYellow;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    if (format !== "oklab" && format !== "css") return this.toFormat(format).toString(format);
    return `oklab(${round(this.lightness, 5)} ${round(this.greenRed, 5)} ${round(this.blueYellow, 5)}${alphaSuffix(this.alpha)})`;
  }
}

/** OKLCH: OKLab in polar form, and what design tokens are written in. */
export class OKLCHColor extends Color {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
  readonly alpha: number;

  constructor(lightness: number, chroma: number, hue: number, alpha = 1) {
    super();
    this.lightness = clamp(lightness, 0, 1);
    this.chroma = Math.max(chroma, 0);
    this.hue = wrapHue(hue);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "oklch";
  }

  protected own(channel: ColorChannel): number {
    if (channel === "lightness") return this.lightness;
    return channel === "chroma" ? this.chroma : this.hue;
  }

  toString(format: ColorFormat | "css" = "css"): string {
    if (format !== "oklch" && format !== "css") return this.toFormat(format).toString(format);
    return `oklch(${round(this.lightness, 5)} ${round(this.chroma, 5)} ${round(this.hue, 3)}${alphaSuffix(this.alpha)})`;
  }
}

// ---------------------------------------------------------------------------
// Conversions
// https://www.w3.org/TR/css-color-4/#color-conversion-code
// ---------------------------------------------------------------------------

function isSrgbSpace(space: ColorSpace): boolean {
  return space === "rgb" || space === "hsl" || space === "hsb" || space === "hwb";
}

/**
 * The colour in another space.
 *
 * Inside the sRGB family the conversions are direct. Out of it, the colour
 * goes through XYZ, and into it through gamut mapping. A result that is grey
 * takes the source's hue, so the hue survives.
 */
function convert(color: Color, target: ColorSpace): Color {
  const source = color.getColorSpace();
  if (source === target) return color;
  const { alpha, sourceHue } = color;

  if (color instanceof HSLColor && target === "hsb") return hslToHsb(color);
  if (color instanceof HSBColor && target === "hsl") return hsbToHsl(color);
  if (isSrgbSpace(target)) return fromSrgb(target, srgbOf(color), alpha, sourceHue);

  if (target === "lch" || target === "lab") {
    const [lightness, a, b] =
      color instanceof LCHColor
        ? polarToRectangular([color.lightness, color.chroma, color.hue])
        : color instanceof LabColor
          ? [color.lightness, color.greenRed, color.blueYellow]
          : xyzD50ToLab(multiply(D65_TO_D50, xyzOf(color)));
    if (target === "lab") return new LabColor(lightness, a, b, alpha, sourceHue);
    const [, chroma, hue] = rectangularToPolar([lightness, a, b]);
    return new LCHColor(lightness, chroma, chroma <= LCH_ACHROMATIC ? sourceHue : hue, alpha);
  }

  const [lightness, a, b] = oklabOf(color);
  if (target === "oklab") return new OKLabColor(lightness, a, b, alpha, sourceHue);
  const [, chroma, hue] = rectangularToPolar([lightness, a, b]);
  return new OKLCHColor(lightness, chroma, chroma <= OKLCH_ACHROMATIC ? sourceHue : hue, alpha);
}

// Below these a hue is powerless: CSS Color 4's ε for each space.
const LCH_ACHROMATIC = 0.0015;
const OKLCH_ACHROMATIC = 0.000004;
// The smallest spread of the three sRGB channels that still has a hue. A
// difference of one in 8 bits is 1/255; this sits far below that and far
// above the float noise of a grey that came through XYZ.
const SRGB_ACHROMATIC = 1e-7;

function hex(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

/** The colour as sRGB, 0 to 1 per channel; a perceptual colour is gamut mapped into it. */
function srgbOf(color: Color): Triple {
  if (color instanceof RGBColor) return [color.red / 255, color.green / 255, color.blue / 255];
  if (color instanceof HSLColor) return hslToSrgb(color.hue, color.saturation, color.lightness);
  if (color instanceof HSBColor) return hsbToSrgb(color.hue, color.saturation, color.brightness);
  if (color instanceof HWBColor) return hwbToSrgb(color.hue, color.whiteness, color.blackness);
  return gamutMap(oklchOf(color));
}

function fromSrgb(target: ColorSpace, srgb: Triple, alpha: number, hue: number): Color {
  const [red, green, blue] = srgb;
  switch (target) {
    case "hsl": {
      const [h, s, l] = srgbToHsl(red, green, blue);
      return new HSLColor(Number.isNaN(h) ? hue : h, s, l, alpha);
    }
    case "hsb": {
      const [h, s, b] = srgbToHsb(red, green, blue);
      return new HSBColor(Number.isNaN(h) ? hue : h, s, b, alpha);
    }
    case "hwb": {
      const [h, w, b] = srgbToHwb(red, green, blue);
      return new HWBColor(Number.isNaN(h) ? hue : h, w, b, alpha);
    }
    default:
      return new RGBColor(red * 255, green * 255, blue * 255, alpha, hue);
  }
}

/** The hue of an sRGB colour in degrees, or NaN for a grey. */
function srgbHue(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta < SRGB_ACHROMATIC) return Number.NaN;
  let hue: number;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
  else if (max === green) hue = ((blue - red) / delta + 2) * 60;
  else hue = ((red - green) / delta + 4) * 60;
  return hue >= 360 ? hue - 360 : hue;
}

function srgbToHsl(red: number, green: number, blue: number): Triple {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const hue = srgbHue(red, green, blue);
  if (Number.isNaN(hue)) return [hue, 0, lightness * 100];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  return [hue, saturation * 100, lightness * 100];
}

function hslToSrgb(hue: number, saturation: number, lightness: number): Triple {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  if (s === 0) return [l, l, l];

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  function channel(t: number): number {
    let at = t;
    if (at < 0) at += 1;
    if (at > 1) at -= 1;
    if (at < 1 / 6) return p + (q - p) * 6 * at;
    if (at < 1 / 2) return q;
    if (at < 2 / 3) return p + (q - p) * (2 / 3 - at) * 6;
    return p;
  }
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

function srgbToHsb(red: number, green: number, blue: number): Triple {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const hue = srgbHue(red, green, blue);
  if (Number.isNaN(hue)) return [hue, 0, max * 100];
  return [hue, ((max - min) / max) * 100, max * 100];
}

function hsbToSrgb(hue: number, saturation: number, brightness: number): Triple {
  const h = hue / 60;
  const s = saturation / 100;
  const v = brightness / 100;

  const sector = Math.floor(h) % 6;
  const fraction = h - Math.floor(h);
  const p = v * (1 - s);
  const q = v * (1 - fraction * s);
  const t = v * (1 - (1 - fraction) * s);

  const triples: Triple[] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  return triples[sector] ?? [v, v, v];
}

// https://www.w3.org/TR/css-color-4/#hwb-to-rgb
function hwbToSrgb(hue: number, whiteness: number, blackness: number): Triple {
  const white = whiteness / 100;
  const black = blackness / 100;
  if (white + black >= 1) {
    const grey = white / (white + black);
    return [grey, grey, grey];
  }
  const [red, green, blue] = hslToSrgb(hue, 100, 50);
  const scale = 1 - white - black;
  return [red * scale + white, green * scale + white, blue * scale + white];
}

// https://www.w3.org/TR/css-color-4/#rgb-to-hwb
function srgbToHwb(red: number, green: number, blue: number): Triple {
  const white = Math.min(red, green, blue);
  const black = 1 - Math.max(red, green, blue);
  // CSS's ε for HWB: a whiteness and blackness this close to filling the
  // colour leave no hue.
  const hue = white + black >= 1 - 1e-5 ? Number.NaN : srgbHue(red, green, blue);
  return [hue, white * 100, black * 100];
}

function hsbToHsl(color: HSBColor): HSLColor {
  const brightness = color.brightness / 100;
  const saturation = color.saturation / 100;
  const lightness = brightness * (1 - saturation / 2);
  const denominator = Math.min(lightness, 1 - lightness);
  const hslSaturation = denominator === 0 ? 0 : (brightness - lightness) / denominator;
  return new HSLColor(color.hue, hslSaturation * 100, lightness * 100, color.alpha);
}

function hslToHsb(color: HSLColor): HSBColor {
  const lightness = color.lightness / 100;
  const saturation = color.saturation / 100;
  const brightness = lightness + saturation * Math.min(lightness, 1 - lightness);
  const hsbSaturation = brightness === 0 ? 0 : 2 * (1 - lightness / brightness);
  return new HSBColor(color.hue, hsbSaturation * 100, brightness * 100, color.alpha);
}

type Matrix = readonly [number, number, number, number, number, number, number, number, number];

function multiply(matrix: Matrix, [x, y, z]: Triple): Triple {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z,
    matrix[3] * x + matrix[4] * y + matrix[5] * z,
    matrix[6] * x + matrix[7] * y + matrix[8] * z,
  ];
}

// The extended transfer functions: a negative channel, out of gamut, mirrors
// the curve rather than breaking it.
function toLinear(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= 0.04045) return value / 12.92;
  return Math.sign(value) * ((magnitude + 0.055) / 1.055) ** 2.4;
}

function toGamma(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude > 0.0031308) return Math.sign(value) * (1.055 * magnitude ** (1 / 2.4) - 0.055);
  return 12.92 * value;
}

const LINEAR_SRGB_TO_XYZ: Matrix = [
  506752 / 1228815,
  87881 / 245763,
  12673 / 70218,
  87098 / 409605,
  175762 / 245763,
  12673 / 175545,
  7918 / 409605,
  87881 / 737289,
  1001167 / 1053270,
];

const XYZ_TO_LINEAR_SRGB: Matrix = [
  12831 / 3959,
  -329 / 214,
  -1974 / 3959,
  -851781 / 878810,
  1648619 / 878810,
  36519 / 878810,
  705 / 12673,
  -2585 / 12673,
  705 / 667,
];

// Bradford chromatic adaptation between the two white points: Lab is D50,
// everything else here is D65.
const D65_TO_D50: Matrix = [
  1.0479297925449969, 0.022946870601609652, -0.05019226628920524, 0.02962780877005599,
  0.9904344267538799, -0.017073799063418826, -0.009243040646204504, 0.015055191490298152,
  0.7518742814281371,
];

const D50_TO_D65: Matrix = [
  0.955473421488075, -0.02309845494876471, 0.06325924320057072, -0.0283697093338637,
  1.0099953980813041, 0.021041441191917323, 0.012314014864481998, -0.020507649298898964,
  1.330365926242124,
];

const D50: Triple = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

const XYZ_TO_LMS: Matrix = [
  0.819022437996703, 0.3619062600528904, -0.1288737815209879, 0.0329836539323885,
  0.9292868615863434, 0.0361446663506424, 0.0481771893596242, 0.2642395317527308,
  0.6335478284694309,
];

const LMS_TO_OKLAB: Matrix = [
  0.210454268309314, 0.7936177747023054, -0.0040720430116193, 1.9779985324311684,
  -2.4285922420485799, 0.450593709617411, 0.0259040424655478, 0.7827717124575296,
  -0.8086757549230774,
];

const OKLAB_TO_LMS: Matrix = [
  1, 0.3963377773761749, 0.2158037573099136, 1, -0.1055613458156586, -0.0638541728258133, 1,
  -0.0894841775298119, -1.2914855480194092,
];

const LMS_TO_XYZ: Matrix = [
  1.2268798758459243, -0.5578149944602171, 0.2813910456659647, -0.0405757452148008,
  1.112286803280317, -0.0717110580655164, -0.0763729366746601, -0.4214933324022432,
  1.5869240198367816,
];

function srgbToXyz([red, green, blue]: Triple): Triple {
  return multiply(LINEAR_SRGB_TO_XYZ, [toLinear(red), toLinear(green), toLinear(blue)]);
}

function xyzToSrgb(xyz: Triple): Triple {
  const [red, green, blue] = multiply(XYZ_TO_LINEAR_SRGB, xyz);
  return [toGamma(red), toGamma(green), toGamma(blue)];
}

// CIE's ε and κ, as the rational fractions the standard now defines them as.
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function xyzD50ToLab([x, y, z]: Triple): Triple {
  function f(value: number, white: number): number {
    const scaled = value / white;
    return scaled > LAB_EPSILON ? Math.cbrt(scaled) : (LAB_KAPPA * scaled + 16) / 116;
  }
  const fx = f(x, D50[0]);
  const fy = f(y, D50[1]);
  const fz = f(z, D50[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToXyzD50([lightness, a, b]: Triple): Triple {
  // L kept out of L + 16 for precision near black.
  const lightness116 = lightness / 116;
  const a500 = a / 500;
  const b200 = b / 200;
  const fy = lightness116 + 16 / 116;
  const fx = fy + a500;
  const fz = fy - b200;
  const xyz: Triple = [
    fx ** 3 > LAB_EPSILON ? fx ** 3 : (lightness116 + a500) * (116 / LAB_KAPPA),
    lightness > LAB_KAPPA * LAB_EPSILON ? ((lightness + 16) / 116) ** 3 : lightness / LAB_KAPPA,
    fz ** 3 > LAB_EPSILON ? fz ** 3 : (lightness116 - b200) * (116 / LAB_KAPPA),
  ];
  return [xyz[0] * D50[0], xyz[1] * D50[1], xyz[2] * D50[2]];
}

function xyzToOklab(xyz: Triple): Triple {
  const [l, m, s] = multiply(XYZ_TO_LMS, xyz);
  // `Math.cbrt` keeps the sign, which a general power would not.
  return multiply(LMS_TO_OKLAB, [Math.cbrt(l), Math.cbrt(m), Math.cbrt(s)]);
}

function oklabToXyz(oklab: Triple): Triple {
  const [l, m, s] = multiply(OKLAB_TO_LMS, oklab);
  return multiply(LMS_TO_XYZ, [l ** 3, m ** 3, s ** 3]);
}

function rectangularToPolar([lightness, a, b]: Triple): Triple {
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return [lightness, Math.hypot(a, b), hue < 0 ? hue + 360 : hue];
}

function polarToRectangular([lightness, chroma, hue]: Triple): Triple {
  const radians = (hue * Math.PI) / 180;
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}

/** CIE XYZ relative to D65, from any space. */
function xyzOf(color: Color): Triple {
  if (color instanceof LabColor) {
    return multiply(D50_TO_D65, labToXyzD50([color.lightness, color.greenRed, color.blueYellow]));
  }
  if (color instanceof LCHColor) {
    return multiply(
      D50_TO_D65,
      labToXyzD50(polarToRectangular([color.lightness, color.chroma, color.hue])),
    );
  }
  if (color instanceof OKLabColor || color instanceof OKLCHColor) return oklabToXyz(oklabOf(color));
  return srgbToXyz(srgbOf(color));
}

function oklabOf(color: Color): Triple {
  if (color instanceof OKLabColor) return [color.lightness, color.greenRed, color.blueYellow];
  if (color instanceof OKLCHColor) {
    return polarToRectangular([color.lightness, color.chroma, color.hue]);
  }
  return xyzToOklab(xyzOf(color));
}

function oklchOf(color: Color): Triple {
  if (color instanceof OKLCHColor) return [color.lightness, color.chroma, color.hue];
  return rectangularToPolar(oklabOf(color));
}

function deltaEOK([l1, a1, b1]: Triple, [l2, a2, b2]: Triple): number {
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// One just noticeable difference in OKLab, and how close the search gets.
const JND = 0.02;
const GAMUT_EPSILON = 0.0001;

function inSrgbGamut(srgb: Triple): boolean {
  return srgb.every((channel) => channel >= 0 && channel <= 1);
}

function clip(srgb: Triple): Triple {
  return [clamp(srgb[0], 0, 1), clamp(srgb[1], 0, 1), clamp(srgb[2], 0, 1)];
}

/**
 * An OKLCH colour as the sRGB colour CSS shows for it.
 *
 * CSS Color 4's binary search with local MINDE: lightness and hue stay where
 * they are and chroma comes down until clipping what is left moves the colour
 * by less than a just noticeable difference. Clipping alone would keep the
 * chroma and give up the hue and lightness, which are what the eye notices.
 *
 * https://www.w3.org/TR/css-color-4/#binsearch
 */
function gamutMap([lightness, chroma, hue]: Triple): Triple {
  if (lightness >= 1) return [1, 1, 1];
  if (lightness <= 0) return [0, 0, 0];

  function at(c: number): Triple {
    return polarToRectangular([lightness, c, hue]);
  }
  function srgbAt(c: number): Triple {
    return xyzToSrgb(oklabToXyz(at(c)));
  }
  function delta(srgb: Triple, c: number): number {
    return deltaEOK(xyzToOklab(srgbToXyz(srgb)), at(c));
  }

  const origin = srgbAt(chroma);
  if (inSrgbGamut(origin)) return origin;

  let clipped = clip(origin);
  if (delta(clipped, chroma) < JND) return clipped;

  let min = 0;
  let max = chroma;
  let minInGamut = true;
  while (max - min > GAMUT_EPSILON) {
    const current = (min + max) / 2;
    const srgb = srgbAt(current);
    if (minInGamut && inSrgbGamut(srgb)) {
      min = current;
      continue;
    }
    clipped = clip(srgb);
    const error = delta(clipped, current);
    if (error < JND) {
      if (JND - error < GAMUT_EPSILON) return clipped;
      minInGamut = false;
      min = current;
    } else {
      max = current;
    }
  }
  return clipped;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// Where orange stops being brown, and where yellow stops leaning green.
const ORANGE_LIGHTNESS_THRESHOLD = 0.68;
const YELLOW_GREEN_LIGHTNESS_THRESHOLD = 0.85;
const MAX_DARK_LIGHTNESS = 0.55;
const GRAY_THRESHOLD = 0.001;

const OKLCH_HUES: readonly [number, ColorStringKey][] = [
  [0, "pink"],
  [15, "red"],
  [48, "orange"],
  [94, "yellow"],
  [135, "green"],
  [175, "cyan"],
  [264, "blue"],
  [284, "purple"],
  [320, "magenta"],
  [349, "pink"],
];

/** The hue's name, and the lightness adjusted for it: a light brown is an orange. */
function oklchHueName(
  lightness: number,
  chroma: number,
  hue: number,
  locale: string,
): [string, number] {
  if (chroma < GRAY_THRESHOLD) return [message("gray", locale), lightness];

  for (let at = 0; at < OKLCH_HUES.length; at++) {
    const [start, startName] = OKLCH_HUES[at] as [number, ColorStringKey];
    const [end, endName] = OKLCH_HUES[at + 1] ?? [360, "pink"];
    if (hue < start || hue >= end) continue;

    let name: string = startName;
    let adjusted = lightness;
    if (startName === "orange") {
      if (lightness < ORANGE_LIGHTNESS_THRESHOLD) name = "brown";
      else adjusted = lightness - ORANGE_LIGHTNESS_THRESHOLD + MAX_DARK_LIGHTNESS;
    }

    // At least halfway to the next hue is a blend of the two.
    if (hue > start + (end - start) / 2 && name !== endName) name = `${name} ${endName}`;
    else if (name === "yellow" && adjusted < YELLOW_GREEN_LIGHTNESS_THRESHOLD) {
      name = "yellow green";
    }
    return [message(name as ColorStringKey, locale).toLocaleLowerCase(locale), adjusted];
  }
  return [message("gray", locale), lightness];
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTION = /^([a-z]+)\((.*)\)$/is;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const ANGLE = /^(.*?)(deg|grad|rad|turn)?$/i;

const TURN: Record<string, number> = { deg: 1, grad: 360 / 400, rad: 180 / Math.PI, turn: 360 };

/** How one argument is read: an angle, or a number with what 100% stands for. */
type Argument = { hue: true } | { percent: number };

interface Syntax {
  space: ColorSpace;
  args: [Argument, Argument, Argument];
  /** Whether the comma-separated form of CSS Color 3 is accepted. */
  legacy: boolean;
}

const RGB_SYNTAX: Syntax = {
  space: "rgb",
  args: [{ percent: 255 }, { percent: 255 }, { percent: 255 }],
  legacy: true,
};
const HSL_SYNTAX: Syntax = {
  space: "hsl",
  args: [{ hue: true }, { percent: 100 }, { percent: 100 }],
  legacy: true,
};
const HSB_SYNTAX: Syntax = { ...HSL_SYNTAX, space: "hsb" };

// The percent reference ranges are CSS Color 4's, per function.
const SYNTAXES: Record<string, Syntax> = {
  rgb: RGB_SYNTAX,
  rgba: RGB_SYNTAX,
  hsl: HSL_SYNTAX,
  hsla: HSL_SYNTAX,
  hsb: HSB_SYNTAX,
  hsba: HSB_SYNTAX,
  hwb: { space: "hwb", args: [{ hue: true }, { percent: 100 }, { percent: 100 }], legacy: false },
  lab: {
    space: "lab",
    args: [{ percent: 100 }, { percent: 125 }, { percent: 125 }],
    legacy: false,
  },
  lch: { space: "lch", args: [{ percent: 100 }, { percent: 150 }, { hue: true }], legacy: false },
  oklab: {
    space: "oklab",
    args: [{ percent: 1 }, { percent: 0.4 }, { percent: 0.4 }],
    legacy: false,
  },
  oklch: { space: "oklch", args: [{ percent: 1 }, { percent: 0.4 }, { hue: true }], legacy: false },
};

function notAColour(value: string): RangeError {
  return new RangeError(`Not a colour: ${JSON.stringify(value)}`);
}

// A regular expression rather than `parseFloat`, which reads "12px" as 12, or
// `Number`, which reads the empty string as 0.
function number(text: string, value: string): number {
  if (!NUMBER.test(text)) throw notAColour(value);
  return Number(text);
}

/**
 * One argument of a colour function.
 *
 * `none` is a missing component, which CSS treats as zero once the colour is
 * used; the modern, space-separated syntax allows it and the legacy one does
 * not.
 */
function argument(token: string, kind: Argument, modern: boolean, value: string): number {
  if (modern && token.toLowerCase() === "none") return 0;
  if ("hue" in kind) {
    const angle = ANGLE.exec(token);
    if (angle === null) throw notAColour(value);
    const unit = (angle[2] ?? "deg").toLowerCase();
    return number(angle[1] as string, value) * (TURN[unit] ?? 1);
  }
  if (token.endsWith("%")) return (number(token.slice(0, -1), value) / 100) * kind.percent;
  return number(token, value);
}

function alphaArgument(token: string, modern: boolean, value: string): number {
  return argument(token, { percent: 1 }, modern, value);
}

/**
 * A colour from a string, or a throw naming what was given.
 *
 * Accepts what CSS Color 4 accepts: `#abc`, `#aabbcc`, `#aabbccdd`, `rgb()`,
 * `rgba()`, `hsl()`, `hsla()` in their comma and space forms, and `hwb()`,
 * `lab()`, `lch()`, `oklab()`, `oklch()` in the space form, with `none`,
 * percentages and angle units where CSS allows them. Also `hsb()`/`hsba()`,
 * which CSS does not have but a picker's brightness area is written in.
 */
export function parseColor(value: string): Color {
  const text = value.trim();

  const hexMatch = HEX.exec(text);
  if (hexMatch !== null) {
    const digits = hexMatch[1] as string;
    if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) {
      throw notAColour(value);
    }
    function expand(at: number): number {
      return Number.parseInt(
        digits.length <= 4 ? (digits[at] as string).repeat(2) : digits.slice(at * 2, at * 2 + 2),
        16,
      );
    }
    const hasAlpha = digits.length === 4 || digits.length === 8;
    return new RGBColor(expand(0), expand(1), expand(2), hasAlpha ? expand(3) / 255 : 1);
  }

  const call = FUNCTION.exec(text);
  const syntax = call === null ? undefined : SYNTAXES[(call[1] as string).toLowerCase()];
  if (call === null || syntax === undefined) throw notAColour(value);
  const body = (call[2] as string).trim();

  let tokens: string[];
  let alphaToken: string | undefined;
  const modern = !body.includes(",");
  if (modern) {
    const [channels = "", alpha, ...rest] = body.split("/");
    if (rest.length > 0) throw notAColour(value);
    tokens = channels.trim().split(/\s+/);
    if (alpha !== undefined) {
      alphaToken = alpha.trim();
      if (alphaToken === "" || /\s/.test(alphaToken)) throw notAColour(value);
    }
  } else {
    if (!syntax.legacy) throw notAColour(value);
    const parts = body.split(",").map((entry) => entry.trim());
    if (parts.length > 4) throw notAColour(value);
    tokens = parts.slice(0, 3);
    alphaToken = parts[3];
  }
  if (tokens.length !== 3) throw notAColour(value);

  const read: (at: 0 | 1 | 2) => number = (at) => {
    return argument(tokens[at] ?? "", syntax.args[at], modern, value);
  };
  const alpha = alphaToken === undefined ? 1 : alphaArgument(alphaToken, modern, value);
  return make(syntax.space, [read(0), read(1), read(2)], alpha, 0);
}

/** A strong red, as a starting point for a picker with no value. */
export function defaultColor(): Color {
  return new HSBColor(0, 100, 100, 1);
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

type ColorStringKey =
  | "hue"
  | "saturation"
  | "lightness"
  | "brightness"
  | "red"
  | "green"
  | "blue"
  | "alpha"
  | "whiteness"
  | "blackness"
  | "chroma"
  | "greenRed"
  | "blueYellow"
  | "colorName"
  | "transparentColorName"
  | "very dark"
  | "dark"
  | "light"
  | "very light"
  | "pale"
  | "grayish"
  | "vibrant"
  | "black"
  | "white"
  | "gray"
  | "pink"
  | "pink red"
  | "red orange"
  | "brown"
  | "orange"
  | "orange yellow"
  | "brown yellow"
  | "yellow"
  | "yellow green"
  | "green cyan"
  | "cyan"
  | "cyan blue"
  | "blue purple"
  | "purple"
  | "purple magenta"
  | "magenta"
  | "magenta pink";

const STRINGS = new StringDictionary<ColorStringKey>({
  "ar-AE": {
    hue: "درجة اللون",
    saturation: "التشبع",
    lightness: "الإضاءة",
    brightness: "السطوع",
    red: "أحمر",
    green: "أخضر",
    blue: "أزرق",
    alpha: "ألفا",
    whiteness: "البياض",
    blackness: "السواد",
    chroma: "الكروما",
    greenRed: "أخضر-أحمر",
    blueYellow: "أزرق-أصفر",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} شفاف",
    "very dark": "داكن جدًا",
    dark: "داكن",
    light: "فاتح",
    "very light": "فاتح جدًا",
    pale: "باهت",
    grayish: "مائل للرمادي",
    vibrant: "ساطع",
    black: "أسود",
    white: "أبيض",
    gray: "رمادي",
    pink: "وردي",
    "pink red": "أحمر وردي",
    "red orange": "برتقالي محمر",
    brown: "بني",
    orange: "برتقالي",
    "orange yellow": "أصفر برتقالي",
    "brown yellow": "أصفر بني",
    yellow: "أصفر",
    "yellow green": "أخضر مصفر",
    "green cyan": "سماوي مخضر",
    cyan: "سماوي",
    "cyan blue": "أزرق سماوي",
    "blue purple": "أرجواني مزرق",
    purple: "أرجواني",
    "purple magenta": "بنفسجي",
    magenta: "أرجواني",
    "magenta pink": "أرجواني وردي",
  },
  "bg-BG": {
    hue: "Оттенък",
    saturation: "Наситеност",
    lightness: "Лекота",
    brightness: "Яркост",
    red: "Червено",
    green: "Зелено",
    blue: "Синьо",
    alpha: "Алфа",
    whiteness: "Белота",
    blackness: "Чернота",
    chroma: "Хрома",
    greenRed: "Зелено-червено",
    blueYellow: "Синьо-жълто",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} прозрачен",
    "very dark": "много тъмно",
    dark: "тъмно",
    light: "светло",
    "very light": "много светло",
    pale: "бледо",
    grayish: "сивкав",
    vibrant: " ярко",
    black: "черно",
    white: "бяло",
    gray: "сиво",
    pink: "розово",
    "pink red": "розово червено",
    "red orange": "червен портокал",
    brown: "кафяво",
    orange: "оранжево",
    "orange yellow": "оранжево жълто",
    "brown yellow": "кафяво жълто",
    yellow: "жълто",
    "yellow green": "жълто зелен",
    "green cyan": "зелен циан",
    cyan: "циан",
    "cyan blue": "циан синьо",
    "blue purple": "синьо лилаво",
    purple: "лилаво",
    "purple magenta": "лилаво магента",
    magenta: "магента",
    "magenta pink": "магента розово",
  },
  "cs-CZ": {
    hue: "Odstín",
    saturation: "Sytost",
    lightness: "Světlost",
    brightness: "Jas",
    red: "Červená",
    green: "Zelená",
    blue: "Modrá",
    alpha: "Alfa",
    whiteness: "Bělost",
    blackness: "Černost",
    chroma: "Chroma",
    greenRed: "Zelená-červená",
    blueYellow: "Modrá-žlutá",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} průhledné",
    "very dark": "velmi tmavá",
    dark: "tmavá",
    light: "světlá",
    "very light": "velmi světlá",
    pale: "bledá",
    grayish: "našedlá",
    vibrant: "zářivá",
    black: "černá",
    white: "bílá",
    gray: "šedá",
    pink: "růžová",
    "pink red": "růžovočervená",
    "red orange": "červenooranžová",
    brown: "hnědá",
    orange: "oranžová",
    "orange yellow": "oranžovožlutá",
    "brown yellow": "hnědožlutá",
    yellow: "žlutá",
    "yellow green": "žlutozelená",
    "green cyan": "zelenotyrkysová",
    cyan: "tyrkysová",
    "cyan blue": "tyrkysovomodrá",
    "blue purple": "modrofialová",
    purple: "fialová",
    "purple magenta": "fialově purpurová",
    magenta: "purpurová",
    "magenta pink": "purpurově růžová",
  },
  "da-DK": {
    hue: "Tone",
    saturation: "Farvemætning",
    lightness: "Lyshed",
    brightness: "Lysstyrke",
    red: "Rød",
    green: "Grøn",
    blue: "Blå",
    alpha: "Alfa",
    whiteness: "Hvidhed",
    blackness: "Sorthed",
    chroma: "Kroma",
    greenRed: "Grøn-rød",
    blueYellow: "Blå-gul",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} gennemsigtig",
    "very dark": "meget mørk",
    dark: "mørk",
    light: "lys",
    "very light": "meget lys",
    pale: "bleg",
    grayish: "grålig",
    vibrant: "klar",
    black: "sort",
    white: "hvid",
    gray: "grå",
    pink: "lyserød",
    "pink red": "lyserødlig rød",
    "red orange": "rødorange",
    brown: "brun",
    orange: "orange",
    "orange yellow": "orangegul",
    "brown yellow": "brungul",
    yellow: "gul",
    "yellow green": "gulgrøn",
    "green cyan": "grøn cyan",
    cyan: "cyan",
    "cyan blue": "cyan blå",
    "blue purple": "blålilla",
    purple: "lilla",
    "purple magenta": "lilla magenta",
    magenta: "magenta",
    "magenta pink": "magenta pink",
  },
  "de-DE": {
    hue: "Farbton",
    saturation: "Sättigung",
    lightness: "Leuchtkraft",
    brightness: "Helligkeit",
    red: "Rot",
    green: "Grün",
    blue: "Blau",
    alpha: "Alpha",
    whiteness: "Weißanteil",
    blackness: "Schwarzanteil",
    chroma: "Buntheit",
    greenRed: "Grün-Rot",
    blueYellow: "Blau-Gelb",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, zu {percentTransparent} transparent",
    "very dark": "sehr dunkles",
    dark: "dunkles",
    light: "helles",
    "very light": "sehr helles",
    pale: "blasses",
    grayish: "gräuliches",
    vibrant: "lebhaftes",
    black: "Schwarz",
    white: "Weiß",
    gray: "Grau",
    pink: "Rosa",
    "pink red": "Rosarot",
    "red orange": "Rotorange",
    brown: "Braun",
    orange: "Orange",
    "orange yellow": "Orangegelb",
    "brown yellow": "Braungelb",
    yellow: "Gelb",
    "yellow green": "Gelbgrün",
    "green cyan": "Grüncyan",
    cyan: "Cyan",
    "cyan blue": "Cyanblau",
    "blue purple": "Blaulila",
    purple: "Lila",
    "purple magenta": "Lilamagenta",
    magenta: "Magenta",
    "magenta pink": "Magentarosa",
  },
  "el-GR": {
    hue: "Τόνος",
    saturation: "Κορεσμός",
    lightness: "Φωτεινότητα",
    brightness: "Φωτεινότητα",
    red: "Κόκκινο",
    green: "Πράσινο",
    blue: "Μπλε",
    alpha: "Άλφα",
    whiteness: "Λευκότητα",
    blackness: "Μαυρότητα",
    chroma: "Χρωματικότητα",
    greenRed: "Πράσινο-κόκκινο",
    blueYellow: "Μπλε-κίτρινο",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} διαφανές",
    "very dark": "πολύ σκούρο",
    dark: "σκούρο",
    light: "ανοιχτό",
    "very light": "πολύ ανοιχτό",
    pale: "ανοιχτό",
    grayish: "γκριζωπό",
    vibrant: "έντονο",
    black: "μαύρο",
    white: "λευκό",
    gray: "γκρι",
    pink: "ροζ",
    "pink red": "ροζ κόκκινο",
    "red orange": "κόκκινο πορτοκαλί",
    brown: "καφέ",
    orange: "πορτοκαλί",
    "orange yellow": "πορτοκαλί κίτρινο",
    "brown yellow": "καφέ κίτρινο",
    yellow: "κίτρινο",
    "yellow green": "κίτρινο πράσινο",
    "green cyan": "πράσινο κυανό",
    cyan: "κυανό",
    "cyan blue": "κυανό μπλε",
    "blue purple": "μπλε μωβ",
    purple: "μωβ",
    "purple magenta": "μωβ ματζέντα",
    magenta: "ματζέντα",
    "magenta pink": "ματζέντα ροζ",
  },
  "en-US": {
    hue: "Hue",
    saturation: "Saturation",
    lightness: "Lightness",
    brightness: "Brightness",
    red: "Red",
    green: "Green",
    blue: "Blue",
    alpha: "Alpha",
    whiteness: "Whiteness",
    blackness: "Blackness",
    chroma: "Chroma",
    greenRed: "Green-red",
    blueYellow: "Blue-yellow",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparent",
    "very dark": "very dark",
    dark: "dark",
    light: "light",
    "very light": "very light",
    pale: "pale",
    grayish: "grayish",
    vibrant: "vibrant",
    black: "black",
    white: "white",
    gray: "gray",
    pink: "pink",
    "pink red": "pink red",
    "red orange": "red orange",
    brown: "brown",
    orange: "orange",
    "orange yellow": "orange yellow",
    "brown yellow": "brown yellow",
    yellow: "yellow",
    "yellow green": "yellow green",
    "green cyan": "green cyan",
    cyan: "cyan",
    "cyan blue": "cyan blue",
    "blue purple": "blue purple",
    purple: "purple",
    "purple magenta": "purple magenta",
    magenta: "magenta",
    "magenta pink": "magenta pink",
  },
  "es-ES": {
    hue: "Tono",
    saturation: "Saturación",
    lightness: "Luminosidad",
    brightness: "Brillo",
    red: "Rojo",
    green: "Verde",
    blue: "Azul",
    alpha: "Alpha",
    whiteness: "Blancura",
    blackness: "Negrura",
    chroma: "Croma",
    greenRed: "Verde-rojo",
    blueYellow: "Azul-amarillo",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparente",
    "very dark": "muy oscuro",
    dark: "oscuro",
    light: "claro",
    "very light": "muy claro",
    pale: "pálido",
    grayish: "grisáceo",
    vibrant: "intenso",
    black: "negro",
    white: "blanco",
    gray: "gris",
    pink: "rosa",
    "pink red": "rojo rosado",
    "red orange": "naranja rojizo",
    brown: "marrón",
    orange: "naranja",
    "orange yellow": "amarillo anaranjado",
    "brown yellow": "amarillo amarronado",
    yellow: "amarillo",
    "yellow green": "verde amarillento",
    "green cyan": "cian verdoso",
    cyan: "cian",
    "cyan blue": "azul cian",
    "blue purple": "púrpura azulado",
    purple: "morado",
    "purple magenta": "magenta violáceo",
    magenta: "magenta",
    "magenta pink": "rosa magenta",
  },
  "et-EE": {
    hue: "Värv",
    saturation: "Küllastus",
    lightness: "Valgus",
    brightness: "Heledus",
    red: "Punane",
    green: "Roheline",
    blue: "Sinine",
    alpha: "Alfa",
    whiteness: "Valgesus",
    blackness: "Mustus",
    chroma: "Kroomsus",
    greenRed: "Roheline-punane",
    blueYellow: "Sinine-kollane",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} läbipaistev",
    "very dark": "väga tume",
    dark: "tume",
    light: "valgus",
    "very light": "väga hele",
    pale: "kahvatu",
    grayish: "hallikas",
    vibrant: "ere",
    black: "must",
    white: "valge",
    gray: "hall",
    pink: "roosa",
    "pink red": "vaarikapunane",
    "red orange": "punakasoranž",
    brown: "pruun",
    orange: "oranž",
    "orange yellow": "oranžikaskollane",
    "brown yellow": "pruunikaskollane",
    yellow: "kollane",
    "yellow green": "kollakasroheline",
    "green cyan": "tsüaanroheline",
    cyan: "tsüaan",
    "cyan blue": "tsüaansinine",
    "blue purple": "sinakaslilla",
    purple: "lilla",
    "purple magenta": "purpurne magenta",
    magenta: "magentapunane",
    "magenta pink": "magentaroosa",
  },
  "fi-FI": {
    hue: "Sävy",
    saturation: "Värikylläisyys",
    lightness: "Valomäärä",
    brightness: "Kirkkaus",
    red: "Punainen",
    green: "Vihreä",
    blue: "Sininen",
    alpha: "Alpha",
    whiteness: "Valkoisuus",
    blackness: "Mustuus",
    chroma: "Kroma",
    greenRed: "Vihreä-punainen",
    blueYellow: "Sininen-keltainen",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} läpinäkyvä",
    "very dark": "hyvin tumma",
    dark: "tumma",
    light: "vaalea",
    "very light": "erittäin vaalea",
    pale: "vaalea",
    grayish: "harmahtava",
    vibrant: "eloisa",
    black: "musta",
    white: "valkea",
    gray: "harmaa",
    pink: "pinkki",
    "pink red": "vaaleanpunainen",
    "red orange": "punaoranssi",
    brown: "ruskea",
    orange: "oranssi",
    "orange yellow": "oranssinkeltainen",
    "brown yellow": "ruskeankeltainen",
    yellow: "keltainen",
    "yellow green": "keltavihreä",
    "green cyan": "vihreänsyaani",
    cyan: "syaani",
    "cyan blue": "syaaninsininen",
    "blue purple": "sinivioletti",
    purple: "violetti",
    "purple magenta": "violettimagenta",
    magenta: "magenta",
    "magenta pink": "magentapinkki",
  },
  "fr-FR": {
    hue: "Teinte",
    saturation: "Saturation",
    lightness: "Luminosité",
    brightness: "Luminosité",
    red: "Rouge",
    green: "Vert",
    blue: "Bleu",
    alpha: "Alpha",
    whiteness: "Blancheur",
    blackness: "Noirceur",
    chroma: "Chroma",
    greenRed: "Vert-rouge",
    blueYellow: "Bleu-jaune",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparent",
    "very dark": "Très sombre",
    dark: "Sombre",
    light: "Clair",
    "very light": "Très clair",
    pale: "Pâle",
    grayish: "Grisâtre",
    vibrant: "Vif",
    black: "Noir",
    white: "Blanc",
    gray: "Gris",
    pink: "Rose",
    "pink red": "Rouge rosé",
    "red orange": "Orange rouge",
    brown: "Brun",
    orange: "Orange",
    "orange yellow": "Jaune orangé",
    "brown yellow": "Jaune brun",
    yellow: "Jaune",
    "yellow green": "Vert jaune",
    "green cyan": "Cyan vert",
    cyan: "Cyan",
    "cyan blue": "Bleu cyan",
    "blue purple": "Violet bleu",
    purple: "Violet",
    "purple magenta": "Magenta violet",
    magenta: "Magenta",
    "magenta pink": "Rose magenta",
  },
  "he-IL": {
    hue: "גוון",
    saturation: "רוויה",
    lightness: "כמות אור",
    brightness: "בהירות",
    red: "אדום",
    green: "ירוק",
    blue: "כחול",
    alpha: "אלפא",
    whiteness: "לובן",
    blackness: "שחרות",
    chroma: "כרומה",
    greenRed: "ירוק-אדום",
    blueYellow: "כחול-צהוב",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} שקוף",
    "very dark": "כהה מאוד",
    dark: "כהה",
    light: "אור",
    "very light": "בהיר מאוד",
    pale: "חיוור",
    grayish: "אפרפר",
    vibrant: "תוסס",
    black: "שחור",
    white: "לבן",
    gray: "אפור",
    pink: "ורוד",
    "pink red": "ורוד אדום",
    "red orange": "כתום אדום",
    brown: "חום",
    orange: "כתום",
    "orange yellow": "כתום צהוב",
    "brown yellow": "חום צהוב",
    yellow: "צהוב",
    "yellow green": "צהוב ירוק",
    "green cyan": "ציאן ירוק",
    cyan: "טורקיז",
    "cyan blue": "כחול ציאן",
    "blue purple": "כחול סגול",
    purple: "סגול",
    "purple magenta": "מג'נטה סגול",
    magenta: "מג'נטה",
    "magenta pink": "ורוד מג'נטה",
  },
  "hr-HR": {
    hue: "Nijansa",
    saturation: "Zasićenost",
    lightness: "Osvijetljenost",
    brightness: "Svjetlina",
    red: "Crvena",
    green: "Zelena",
    blue: "Plava",
    alpha: "Alfa",
    whiteness: "Bjelina",
    blackness: "Crnina",
    chroma: "Kroma",
    greenRed: "Zelena-crvena",
    blueYellow: "Plava-žuta",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} prozirnosti",
    "very dark": "jako tamna",
    dark: "tamno",
    light: "svjetlo",
    "very light": "vrlo svijetlo",
    pale: "blijeda",
    grayish: "sivkasto",
    vibrant: "vibrantna",
    black: "crno",
    white: "bijela",
    gray: "siva",
    pink: "ružičasta",
    "pink red": "ružičasto crvena",
    "red orange": "crveno narančasta",
    brown: "smeđa",
    orange: "narančasta",
    "orange yellow": "narančasto žuta",
    "brown yellow": "smeđe žuta",
    yellow: "žuto",
    "yellow green": "žuto zelena",
    "green cyan": "zelena cijan",
    cyan: "cijan",
    "cyan blue": "cijan plava",
    "blue purple": "plavo ljubičasta",
    purple: "ljubičasta",
    "purple magenta": "ljubičasta magenta",
    magenta: "magenta",
    "magenta pink": "magentno ružičasta",
  },
  "hu-HU": {
    hue: "Színárnyalat",
    saturation: "Telítettség",
    lightness: "Világosság",
    brightness: "Fényesség",
    red: "Piros",
    green: "Zöld",
    blue: "Kék",
    alpha: "Alfa",
    whiteness: "Fehérség",
    blackness: "Feketeség",
    chroma: "Króma",
    greenRed: "Zöld-piros",
    blueYellow: "Kék-sárga",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} átlátszó",
    "very dark": "nagyon sötét",
    dark: "sötét",
    light: "világos",
    "very light": "nagyon világos",
    pale: "halvány",
    grayish: "szürkés",
    vibrant: "élénk",
    black: "fekete",
    white: "fehér",
    gray: "szürke",
    pink: "rózsaszín",
    "pink red": "rózsaszín piros",
    "red orange": "piros narancs",
    brown: "barna",
    orange: "narancs",
    "orange yellow": "narancssárga",
    "brown yellow": "barna sárga",
    yellow: "sárga",
    "yellow green": "sárga zöld",
    "green cyan": "zöld ciánkék",
    cyan: "ciánkék",
    "cyan blue": "ciánkék",
    "blue purple": "kék lila",
    purple: "lila",
    "purple magenta": "lila bíbor",
    magenta: "bíbor",
    "magenta pink": "bíbor rózsaszín",
  },
  "it-IT": {
    hue: "Tonalità",
    saturation: "Saturazione",
    lightness: "Luminosità",
    brightness: "Luminosità",
    red: "Rosso",
    green: "Verde",
    blue: "Blu",
    alpha: "Alfa",
    whiteness: "Bianchezza",
    blackness: "Nerezza",
    chroma: "Croma",
    greenRed: "Verde-rosso",
    blueYellow: "Blu-giallo",
    colorName: "{hue} {chroma} {lightness}",
    transparentColorName: "{hue} {chroma} {lightness}, trasparenza {percentTransparent}",
    "very dark": "molto scuro",
    dark: "scuro",
    light: "chiaro",
    "very light": "molto chiaro",
    pale: "tenue",
    grayish: "grigiastro",
    vibrant: "vivace",
    black: "nero",
    white: "bianco",
    gray: "grigio",
    pink: "rosa",
    "pink red": "rosa rosso",
    "red orange": "rosso arancio",
    brown: "marrone",
    orange: "arancio",
    "orange yellow": "giallo arancio",
    "brown yellow": "giallo bruno",
    yellow: "giallo",
    "yellow green": "giallo verde",
    "green cyan": "verde ciano",
    cyan: "ciano",
    "cyan blue": "blu ciano",
    "blue purple": "blu viola",
    purple: "viola",
    "purple magenta": "viola magenta",
    magenta: "magenta",
    "magenta pink": "rosa magenta",
  },
  "ja-JP": {
    hue: "色相",
    saturation: "彩度",
    lightness: "明度",
    brightness: "明るさ",
    red: "赤",
    green: "緑",
    blue: "青",
    alpha: "アルファ",
    whiteness: "白み",
    blackness: "黒み",
    chroma: "クロマ",
    greenRed: "緑-赤",
    blueYellow: "青-黄",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} 透明",
    "very dark": "最も暗い",
    dark: "ダーク",
    light: "ライト",
    "very light": "ベリーライト",
    pale: "ペール",
    grayish: "グレイッシュ",
    vibrant: "鮮やか",
    black: "ブラック",
    white: "ホワイト",
    gray: "グレー",
    pink: "ピンク",
    "pink red": "ピンクレッド",
    "red orange": "レッドオレンジ",
    brown: "ブラウン",
    orange: "オレンジ",
    "orange yellow": "オレンジイエロー",
    "brown yellow": "ブラウンイエロー",
    yellow: "イエロー",
    "yellow green": "イエローグリーン",
    "green cyan": "グリーンシアン",
    cyan: "シアン",
    "cyan blue": "シアンブルー",
    "blue purple": "ブルーパープル",
    purple: "パープル",
    "purple magenta": "パープルマゼンタ",
    magenta: "マゼンタ",
    "magenta pink": "マゼンタピンク",
  },
  "ko-KR": {
    hue: "색조",
    saturation: "채도",
    lightness: "밝기",
    brightness: "명도",
    red: "빨강",
    green: "초록",
    blue: "파랑",
    alpha: "알파",
    whiteness: "백색도",
    blackness: "흑색도",
    chroma: "크로마",
    greenRed: "초록-빨강",
    blueYellow: "파랑-노랑",
    colorName: "{lightness}, {chroma}, {hue}",
    transparentColorName: "{lightness}, {chroma}, {hue}, {percentTransparent} 투명도",
    "very dark": "매우 어두운",
    dark: "다크",
    light: "라이트",
    "very light": "매우 연함",
    pale: "흙색",
    grayish: "회갈색",
    vibrant: "강렬한",
    black: "검은색",
    white: "흰색",
    gray: "회색",
    pink: "분홍색",
    "pink red": "핑크 레드",
    "red orange": "붉은 주황색",
    brown: "갈색",
    orange: "주황색",
    "orange yellow": "불그스름한 노랑",
    "brown yellow": "황갈색",
    yellow: "노란색",
    "yellow green": "연두색",
    "green cyan": "청록색",
    cyan: "청록색",
    "cyan blue": "청록색",
    "blue purple": "청자색",
    purple: "자주색",
    "purple magenta": "보라빛 자홍색",
    magenta: "자홍색",
    "magenta pink": "마젠타 핑크",
  },
  "lt-LT": {
    hue: "Atspalvis",
    saturation: "Įsotinimas",
    lightness: "Šviesumas",
    brightness: "Ryškumas",
    red: "Raudona",
    green: "Žalia",
    blue: "Mėlyna",
    alpha: "Alfa",
    whiteness: "Baltumas",
    blackness: "Juodumas",
    chroma: "Chroma",
    greenRed: "Žalia-raudona",
    blueYellow: "Mėlyna-geltona",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} skaidri",
    "very dark": "labai tamsi",
    dark: "tamsi",
    light: "šviesi",
    "very light": "labai šviesi",
    pale: "blyški",
    grayish: "pilkšva",
    vibrant: "ryški",
    black: "juoda",
    white: "balta",
    gray: "pilka",
    pink: "rožinė",
    "pink red": "rožinė raudona",
    "red orange": "rausvai oranžinė",
    brown: "ruda",
    orange: "oranžinė",
    "orange yellow": "oranžinio atspalvio geltona",
    "brown yellow": "rusvai geltona",
    yellow: "geltona",
    "yellow green": "gelsvai žalia",
    "green cyan": "žalsvai mėlyna",
    cyan: "žalsvai mėlyna",
    "cyan blue": "žalsvai mėlyna",
    "blue purple": "melsvai violetinė",
    purple: "violetinė",
    "purple magenta": "purpurinė rausvai raudona",
    magenta: "rausvai raudona",
    "magenta pink": "purpurinė",
  },
  "lv-LV": {
    hue: "Nokrāsa",
    saturation: "Piesātinājums",
    lightness: "Gaišums",
    brightness: "Spilgtums",
    red: "Sarkana",
    green: "Zaļa",
    blue: "Zila",
    alpha: "Alfa",
    whiteness: "Baltums",
    blackness: "Melnums",
    chroma: "Hroma",
    greenRed: "Zaļa-sarkana",
    blueYellow: "Zila-dzeltena",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} caurspīdīgs",
    "very dark": "ļoti tumšs",
    dark: "tumšs",
    light: "gaišs",
    "very light": "ļoti gaišs",
    pale: "bāls",
    grayish: "pelēcīgs",
    vibrant: "košs",
    black: "melns",
    white: "balts",
    gray: "pelēks",
    pink: "rozā",
    "pink red": "rozīgi sarkans",
    "red orange": "sarkanīgi oranžs",
    brown: "brūns",
    orange: "oranžs",
    "orange yellow": "oranži dzeltens",
    "brown yellow": "brūni dzeltens",
    yellow: "dzeltens",
    "yellow green": "dzelteni zaļš",
    "green cyan": "zaļš ciāns",
    cyan: "ciāns",
    "cyan blue": "ciāna zils",
    "blue purple": "zili violets",
    purple: "violets",
    "purple magenta": "violets fuksiju",
    magenta: "fuksiju",
    "magenta pink": "fuksiju rozā",
  },
  "nb-NO": {
    hue: "Fargetone",
    saturation: "Metning",
    lightness: "Lyshet",
    brightness: "Lysstyrke",
    red: "Rød",
    green: "Grønn",
    blue: "Blå",
    alpha: "Alfa",
    whiteness: "Hvithet",
    blackness: "Sorthet",
    chroma: "Kroma",
    greenRed: "Grønn-rød",
    blueYellow: "Blå-gul",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} gjennomsiktig",
    "very dark": "svært mørk",
    dark: "mørk",
    light: "lys",
    "very light": "svært lys",
    pale: "blek",
    grayish: "gråaktig",
    vibrant: "levende",
    black: "svart",
    white: "hvit",
    gray: "grå",
    pink: "rosa",
    "pink red": "rosarød",
    "red orange": "rødoransje",
    brown: "brun",
    orange: "oransje",
    "orange yellow": "oransjegul",
    "brown yellow": "brungul",
    yellow: "gul",
    "yellow green": "gulgrønn",
    "green cyan": "grønncyan",
    cyan: "cyan",
    "cyan blue": "cyanblå",
    "blue purple": "blålilla",
    purple: "lilla",
    "purple magenta": "lillamagenta",
    magenta: "magenta",
    "magenta pink": "magentarosa",
  },
  "nl-NL": {
    hue: "Kleurtoon",
    saturation: "Verzadiging",
    lightness: "Lichtsterkte",
    brightness: "Helderheid",
    red: "Rood",
    green: "Groen",
    blue: "Blauw",
    alpha: "Alfa",
    whiteness: "Witheid",
    blackness: "Zwartheid",
    chroma: "Chroma",
    greenRed: "Groen-rood",
    blueYellow: "Blauw-geel",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparant",
    "very dark": "heel donker",
    dark: "donker",
    light: "licht",
    "very light": "heel licht",
    pale: "bleek",
    grayish: "grijsachtig",
    vibrant: "levendig",
    black: "zwart",
    white: "wit",
    gray: "grijs",
    pink: "roze",
    "pink red": "rozerood",
    "red orange": "roodoranje",
    brown: "bruin",
    orange: "oranje",
    "orange yellow": "oranjegeel",
    "brown yellow": "bruingeel",
    yellow: "geel",
    "yellow green": "geelgroen",
    "green cyan": "cyaangroen",
    cyan: "cyaan",
    "cyan blue": "cyaanblauw",
    "blue purple": "paarsblauw",
    purple: "paars",
    "purple magenta": "magentapaars",
    magenta: "magenta",
    "magenta pink": "magentaroze",
  },
  "pl-PL": {
    hue: "Odcień",
    saturation: "Nasycenie",
    lightness: "Jaskrawość",
    brightness: "Jasność",
    red: "Czerwony",
    green: "Zielony",
    blue: "Niebieski",
    alpha: "Alfa",
    whiteness: "Biel",
    blackness: "Czerń",
    chroma: "Chroma",
    greenRed: "Zielony-czerwony",
    blueYellow: "Niebieski-żółty",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} przezroczystości",
    "very dark": "bardzo ciemny",
    dark: "ciemny",
    light: "jasny",
    "very light": "bardzo jasny",
    pale: "blady",
    grayish: "szarawy",
    vibrant: "intensywny",
    black: "czarny",
    white: "biały",
    gray: "szary",
    pink: "różowy",
    "pink red": "różowo-czerwony",
    "red orange": "czerwono-pomarańczowy",
    brown: "brązowy",
    orange: "pomarańczowy",
    "orange yellow": "pomarańczowo-żółty",
    "brown yellow": "brązowo-żółty",
    yellow: "żółty",
    "yellow green": "żółto-zielony",
    "green cyan": "zielono-cyjanowy",
    cyan: "cyjanowy",
    "cyan blue": "cyjanowo-niebieski",
    "blue purple": "niebiesko-fioletowy",
    purple: "fioletowy",
    "purple magenta": "fioletowo-purpurowy",
    magenta: "purpurowy",
    "magenta pink": "purpurowo-różowy",
  },
  "pt-BR": {
    hue: "Matiz",
    saturation: "Saturação",
    lightness: "Luminosidade",
    brightness: "Brilho",
    red: "Vermelho",
    green: "Verde",
    blue: "Azul",
    alpha: "Alfa",
    whiteness: "Brancura",
    blackness: "Negrura",
    chroma: "Croma",
    greenRed: "Verde-vermelho",
    blueYellow: "Azul-amarelo",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparente",
    "very dark": "muito escuro",
    dark: "escuro",
    light: "claro",
    "very light": "muito claro",
    pale: "pálido",
    grayish: "acinzentado",
    vibrant: "vibrante",
    black: "preto",
    white: "branco",
    gray: "cinza",
    pink: "rosa",
    "pink red": "rosa avermelhado",
    "red orange": "laranja avermelhado",
    brown: "marrom",
    orange: "laranja",
    "orange yellow": "amarelo alaranjado",
    "brown yellow": "marrom amarelado",
    yellow: "amarelo",
    "yellow green": "verde amarelado",
    "green cyan": "verde-ciano",
    cyan: "ciano",
    "cyan blue": "azul-ciano",
    "blue purple": "roxo azulado",
    purple: "roxo",
    "purple magenta": "roxo-magenta",
    magenta: "magenta",
    "magenta pink": "rosa-magenta",
  },
  "pt-PT": {
    hue: "Tonalidade",
    saturation: "Saturação",
    lightness: "Claridade",
    brightness: "Luminosidade",
    red: "Vermelho",
    green: "Verde",
    blue: "Azul",
    alpha: "Alfa",
    whiteness: "Brancura",
    blackness: "Negrura",
    chroma: "Croma",
    greenRed: "Verde-vermelho",
    blueYellow: "Azul-amarelo",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparente",
    "very dark": "muito escuro",
    dark: "escuro",
    light: "claro",
    "very light": "muito claro",
    pale: "pálido",
    grayish: "acinzentado",
    vibrant: "vibrante",
    black: "preto",
    white: "branco",
    gray: "cinzento",
    pink: "cor-de-rosa",
    "pink red": "vermelho-rosa",
    "red orange": "laranja-vermelho",
    brown: "castanho",
    orange: "laranja",
    "orange yellow": "amarelo-laranja",
    "brown yellow": "amarelo-castanho",
    yellow: "amarelo",
    "yellow green": "verde-amarelo",
    "green cyan": "verde-ciano",
    cyan: "ciano",
    "cyan blue": "azul-ciano",
    "blue purple": "azul-púrpura",
    purple: "púrpura",
    "purple magenta": "púrpura-magenta",
    magenta: "magenta",
    "magenta pink": "rosa-magenta",
  },
  "ro-RO": {
    hue: "Nuanță",
    saturation: "Saturație",
    lightness: "Luminozitate",
    brightness: "Luminozitate",
    red: "Roșu",
    green: "Verde",
    blue: "Albastru",
    alpha: "Alfa",
    whiteness: "Albeață",
    blackness: "Negreață",
    chroma: "Cromă",
    greenRed: "Verde-roșu",
    blueYellow: "Albastru-galben",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} transparent",
    "very dark": "foarte închis",
    dark: "închis",
    light: "deschis",
    "very light": "foarte deschis",
    pale: "pal",
    grayish: "cenușiu",
    vibrant: "plin de viață",
    black: "negru",
    white: "alb",
    gray: "gri",
    pink: "roz",
    "pink red": "roz-roșu",
    "red orange": "portocaliu-roșu",
    brown: "maro",
    orange: "portocaliu",
    "orange yellow": "galben-portocaliu",
    "brown yellow": "galben maro",
    yellow: "galben",
    "yellow green": "galben-verde",
    "green cyan": "verde bleu",
    cyan: "bleu",
    "cyan blue": "albastru-bleu",
    "blue purple": "albastru-violet",
    purple: "violet",
    "purple magenta": "violet-fucsia",
    magenta: "fucsia",
    "magenta pink": "roz-fucsia",
  },
  "ru-RU": {
    hue: "Оттенок",
    saturation: "Насыщенность",
    lightness: "Освещенность",
    brightness: "Яркость",
    red: "Красный",
    green: "Зеленый",
    blue: "Синий",
    alpha: "Альфа",
    whiteness: "Белизна",
    blackness: "Чернота",
    chroma: "Цветность",
    greenRed: "Зеленый-красный",
    blueYellow: "Синий-желтый",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, прозрачный на {percentTransparent}",
    "very dark": "очень темный",
    dark: "темный",
    light: "светлый",
    "very light": "очень светлый",
    pale: "бледный",
    grayish: "сероватый",
    vibrant: "яркий",
    black: "черный",
    white: "белый",
    gray: "серый",
    pink: "розовый",
    "pink red": "розово-красный",
    "red orange": "красно-оранжевый",
    brown: "коричневый",
    orange: "оранжевый",
    "orange yellow": "оранжево-желтый",
    "brown yellow": "коричнево-желтый",
    yellow: "желтый",
    "yellow green": "желто-зеленый",
    "green cyan": "сине-зеленый",
    cyan: "голубой",
    "cyan blue": "цвет морской волны",
    "blue purple": "сине-фиолетовый",
    purple: "фиолетовый",
    "purple magenta": "фиолетово-пурпурный",
    magenta: "пурпурный",
    "magenta pink": "пурпурно-розовый",
  },
  "sk-SK": {
    hue: "Odtieň",
    saturation: "Sýtosť",
    lightness: "Svetlosť",
    brightness: "Jas",
    red: "Červená",
    green: "Zelená",
    blue: "Modrá",
    alpha: "Alfa",
    whiteness: "Belosť",
    blackness: "Čierność",
    chroma: "Chróma",
    greenRed: "Zelená-červená",
    blueYellow: "Modrá-žltá",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} priehľadná",
    "very dark": "veľmi tmavá",
    dark: "tmavá",
    light: "svetlá",
    "very light": "veľmi svetlá",
    pale: "bledá",
    grayish: "sivastá",
    vibrant: "energická",
    black: "čierna",
    white: "biela",
    gray: "sivá",
    pink: "ružová",
    "pink red": "ružovočervená",
    "red orange": "červenooranžová",
    brown: "hnedá",
    orange: "oranžová",
    "orange yellow": "oranžovožltá",
    "brown yellow": "hnedožltá",
    yellow: "žltá",
    "yellow green": "žltozelená",
    "green cyan": "zelená azúrová",
    cyan: "azúrová",
    "cyan blue": "azúrová modrá",
    "blue purple": "modrofialová",
    purple: "fialová",
    "purple magenta": "fialová purpurová",
    magenta: "purpurová",
    "magenta pink": "ružová purpurová",
  },
  "sl-SI": {
    hue: "Barva",
    saturation: "Nasičenost",
    lightness: "Lahkost",
    brightness: "Svetlost",
    red: "Rdeča",
    green: "Zelena",
    blue: "Modra",
    alpha: "Alfa",
    whiteness: "Belina",
    blackness: "Črnina",
    chroma: "Kroma",
    greenRed: "Zelena-rdeča",
    blueYellow: "Modra-rumena",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} prozorna",
    "very dark": "zelo temna",
    dark: "temna",
    light: "svetla",
    "very light": "zelo svetla",
    pale: "bleda",
    grayish: "sivkasta",
    vibrant: "živahna",
    black: "črna",
    white: "bela",
    gray: "siva",
    pink: "roza",
    "pink red": "roza rdeča",
    "red orange": "rdeče oranžna",
    brown: "rjava",
    orange: "oranžna",
    "orange yellow": "oranžno rumena",
    "brown yellow": "rjavo rumena",
    yellow: "rumena",
    "yellow green": "rumeno zelena",
    "green cyan": "zelena cian",
    cyan: "cian",
    "cyan blue": "cian modra",
    "blue purple": "modro vijolična",
    purple: "vijolična",
    "purple magenta": "vijolično škrlatna",
    magenta: "škrlatna",
    "magenta pink": "škrlatno roza",
  },
  "sr-SP": {
    hue: "Nijansa",
    saturation: "Zasićenje",
    lightness: "Osvetljenje",
    brightness: "Osvetljenost",
    red: "Crvena",
    green: "Zelena",
    blue: "Plava",
    alpha: "Alfa",
    whiteness: "Belina",
    blackness: "Crnina",
    chroma: "Hroma",
    greenRed: "Zelena-crvena",
    blueYellow: "Plava-žuta",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} prozirna",
    "very dark": "veoma tamno",
    dark: "tamno",
    light: "svetla",
    "very light": "vrlo svetlo",
    pale: "bledo",
    grayish: "sivkasta",
    vibrant: "živopisna",
    black: "crno",
    white: "bela",
    gray: "siva",
    pink: "ružičasta",
    "pink red": "ružičastocrvena",
    "red orange": "crvenonarandžasta",
    brown: "smeđa",
    orange: "narandžasta",
    "orange yellow": "narandžastožuta",
    "brown yellow": "smeđežuta",
    yellow: "žuto",
    "yellow green": "žutozelena",
    "green cyan": "zeleno cijan",
    cyan: "cijan",
    "cyan blue": "cijan plava",
    "blue purple": "plavoljubičasta",
    purple: "ljubičasta",
    "purple magenta": "ljubičasta magenta",
    magenta: "purpurnocrvena",
    "magenta pink": "magenta ružičasta",
  },
  "sv-SE": {
    hue: "Nyans",
    saturation: "Mättnad",
    lightness: "Ljushet",
    brightness: "Ljusstyrka",
    red: "Rött",
    green: "Grönt",
    blue: "Blått",
    alpha: "Alfa",
    whiteness: "Vithet",
    blackness: "Svärta",
    chroma: "Kroma",
    greenRed: "Grönt-rött",
    blueYellow: "Blått-gult",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} genomskinlig",
    "very dark": "mycket mörk",
    dark: "mörk",
    light: "ljus",
    "very light": "mycket ljus",
    pale: "blek",
    grayish: "gråaktig",
    vibrant: "livfull",
    black: "svart",
    white: "vit",
    gray: "grå",
    pink: "rosa",
    "pink red": "rosaröd",
    "red orange": "rödorange",
    brown: "brun",
    orange: "orange",
    "orange yellow": "orangegul",
    "brown yellow": "brungul",
    yellow: "gul",
    "yellow green": "gulgrön",
    "green cyan": "grön cyan",
    cyan: "cyan",
    "cyan blue": "cyanblå",
    "blue purple": "blålila",
    purple: "lila",
    "purple magenta": "lila magenta",
    magenta: "magenta",
    "magenta pink": "magentarosa",
  },
  "tr-TR": {
    hue: "Ton",
    saturation: "Doygunluk",
    lightness: "Canlılık",
    brightness: "Parlaklık",
    red: "Kırmızı",
    green: "Yeşil",
    blue: "Mavi",
    alpha: "Alfa",
    whiteness: "Beyazlık",
    blackness: "Siyahlık",
    chroma: "Kroma",
    greenRed: "Yeşil-kırmızı",
    blueYellow: "Mavi-sarı",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} saydam",
    "very dark": "çok koyu",
    dark: "koyu",
    light: "açık",
    "very light": "çok açık",
    pale: "solgun",
    grayish: "grimsi",
    vibrant: "canlı",
    black: "siyah",
    white: "beyaz",
    gray: "gri",
    pink: "pembe",
    "pink red": "pembe kırmızı",
    "red orange": "kırmızı portakal",
    brown: "kahverengi",
    orange: "turuncu",
    "orange yellow": "turuncu sarı",
    "brown yellow": "kahverengi sarı",
    yellow: "sarı",
    "yellow green": "sarı yeşil",
    "green cyan": "yeşil camgöbeği",
    cyan: "camgöbeği",
    "cyan blue": "camgöbeği mavi",
    "blue purple": "mavi mor",
    purple: "mor",
    "purple magenta": "mor eflatun",
    magenta: "eflatun",
    "magenta pink": "eflatun pembe",
  },
  "uk-UA": {
    hue: "Тон",
    saturation: "Насиченість",
    lightness: "Освітленість",
    brightness: "Яскравість",
    red: "Червоний",
    green: "Зелений",
    blue: "Синій",
    alpha: "Альфа",
    whiteness: "Білизна",
    blackness: "Чорнота",
    chroma: "Кольоровість",
    greenRed: "Зелений-червоний",
    blueYellow: "Синій-жовтий",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, прозорий на {percentTransparent}",
    "very dark": "дуже темний",
    dark: "темний",
    light: "світлий",
    "very light": "дуже світлий",
    pale: "блідий",
    grayish: "сіруватий",
    vibrant: "яскравий",
    black: "чорний",
    white: "білий",
    gray: "сірий",
    pink: "рожевий",
    "pink red": "рожево-червоний",
    "red orange": "червоно-помаранчевий",
    brown: "коричневий",
    orange: "помаранчевий",
    "orange yellow": "помаранчево-жовтий",
    "brown yellow": "коричнево-жовтий",
    yellow: "жовтий",
    "yellow green": "жовто-зелений",
    "green cyan": "зелено-блакитний",
    cyan: "блакитний",
    "cyan blue": "синьо-блакитний",
    "blue purple": "синьо-фіолетовий",
    purple: "фіолетовий",
    "purple magenta": "фіолетово-пурпуровий",
    magenta: "пурпуровий",
    "magenta pink": "пурпурово-рожевий",
  },
  "zh-CN": {
    hue: "色相",
    saturation: "饱和度",
    lightness: "明亮度",
    brightness: "亮度",
    red: "红色",
    green: "绿色",
    blue: "蓝色",
    alpha: "Alpha",
    whiteness: "白度",
    blackness: "黑度",
    chroma: "色度",
    greenRed: "绿-红",
    blueYellow: "蓝-黄",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} 透明",
    "very dark": "很暗",
    dark: "深色",
    light: "浅色",
    "very light": "很浅",
    pale: "苍白的",
    grayish: "浅灰色的",
    vibrant: "生机勃勃",
    black: "黑色",
    white: "白色",
    gray: "灰色",
    pink: "粉色",
    "pink red": "粉红色",
    "red orange": "红橙色",
    brown: "棕色的",
    orange: "橙色",
    "orange yellow": "橙黄色",
    "brown yellow": "棕黄色",
    yellow: "黄色",
    "yellow green": "黄色/绿色",
    "green cyan": "绿青色",
    cyan: "蓝绿色",
    "cyan blue": "青蓝色",
    "blue purple": "蓝紫色",
    purple: "紫色",
    "purple magenta": "紫洋红色",
    magenta: "紫红色",
    "magenta pink": "紫粉色",
  },
  "zh-TW": {
    hue: "色相",
    saturation: "飽和度",
    lightness: "明亮",
    brightness: "亮度",
    red: "紅色",
    green: "綠色",
    blue: "藍色",
    alpha: "Alpha",
    whiteness: "白度",
    blackness: "黑度",
    chroma: "色度",
    greenRed: "綠-紅",
    blueYellow: "藍-黃",
    colorName: "{lightness} {chroma} {hue}",
    transparentColorName: "{lightness} {chroma} {hue}, {percentTransparent} 透明",
    "very dark": "很暗",
    dark: "暗",
    light: "淺",
    "very light": "很淺",
    pale: "淡",
    grayish: "偏灰",
    vibrant: "鮮豔",
    black: "黑",
    white: "白",
    gray: "灰",
    pink: "粉紅",
    "pink red": "粉紅",
    "red orange": "橙紅",
    brown: "棕",
    orange: "橙",
    "orange yellow": "橙黃",
    "brown yellow": "棕黃",
    yellow: "黃",
    "yellow green": "黃綠",
    "green cyan": "青綠",
    cyan: "青",
    "cyan blue": "青藍",
    "blue purple": "藍紫",
    purple: "紫",
    "purple magenta": "紫洋紅",
    magenta: "洋紅",
    "magenta pink": "淺洋紅",
  },
});
