/**
 * Colours as values, in the three spaces a picker needs.
 *
 * A colour picker is not one control but four — an area, a hue slider, an
 * alpha slider, a hex field — and each edits a different SPACE. Dragging in a
 * saturation/brightness area is HSB; the hue wheel is HSL or HSB; the field is
 * hex, which is RGB. So a colour has to be convertible between all three
 * without drifting, and that means:
 *
 * - **Hue survives a round trip through grey.** Converting `hsb(210, 0%, 50%)`
 *   to RGB loses the hue — every grey is the same three numbers — and back
 *   again would answer 0. So a conversion carries the hue rather than
 *   recomputing it, and dragging saturation to zero and back does not spin the
 *   wheel to red.
 * - **Every channel knows its own range and step.** A hue is 0–360 and wraps;
 *   a saturation is 0–100; a red is 0–255. A slider that assumed 0–100 for all
 *   of them would give the wrong value for two of the three.
 * - **A colour is immutable.** `withChannelValue` answers a new one, so a
 *   drag can hold the colour it started from and compare by content.
 */

import { StringDictionary, StringFormatter } from "./i18n.ts";

export type ColorSpace = "rgb" | "hsl" | "hsb";

export type ColorChannel =
  | "hue"
  | "saturation"
  | "brightness"
  | "lightness"
  | "red"
  | "green"
  | "blue"
  | "alpha";

export type ColorFormat = "hex" | "hexa" | "rgb" | "rgba" | "hsl" | "hsla" | "hsb" | "hsba";

export interface ColorChannelRange {
  minValue: number;
  maxValue: number;
  step: number;
  /** How far Page Up and Page Down move. */
  pageSize: number;
}

const RANGES: Record<ColorChannel, ColorChannelRange> = {
  hue: { minValue: 0, maxValue: 360, step: 1, pageSize: 15 },
  saturation: { minValue: 0, maxValue: 100, step: 1, pageSize: 10 },
  brightness: { minValue: 0, maxValue: 100, step: 1, pageSize: 10 },
  lightness: { minValue: 0, maxValue: 100, step: 1, pageSize: 10 },
  red: { minValue: 0, maxValue: 255, step: 1, pageSize: 17 },
  green: { minValue: 0, maxValue: 255, step: 1, pageSize: 17 },
  blue: { minValue: 0, maxValue: 255, step: 1, pageSize: 17 },
  alpha: { minValue: 0, maxValue: 1, step: 0.01, pageSize: 0.1 },
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

const DEGREES: Intl.NumberFormatOptions = { style: "unit", unit: "degree", unitDisplay: "narrow" };
const PERCENT: Intl.NumberFormatOptions = { style: "percent" };
const DECIMAL: Intl.NumberFormatOptions = { style: "decimal" };

const FORMATS: Record<ColorChannel, Intl.NumberFormatOptions> = {
  hue: DEGREES,
  saturation: PERCENT,
  brightness: PERCENT,
  lightness: PERCENT,
  red: DECIMAL,
  green: DECIMAL,
  blue: DECIMAL,
  alpha: PERCENT,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, places = 0): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** A colour, in whichever space it was written in. */
export abstract class Color {
  abstract readonly alpha: number;
  abstract getColorSpace(): ColorSpace;
  abstract toFormat(format: ColorFormat): Color;
  abstract toString(format?: ColorFormat | "css"): string;
  abstract getChannelValue(channel: ColorChannel): number;
  abstract withChannelValue(channel: ColorChannel, value: number): Color;
  abstract getColorChannels(): [ColorChannel, ColorChannel, ColorChannel];

  getChannelRange(channel: ColorChannel): ColorChannelRange {
    return RANGES[channel];
  }

  getChannelName(channel: ColorChannel, locale = "en-US"): string {
    return message(channel, locale);
  }

  /** How the channel's number is written for a person: `210°`, `25%`, `170`. */
  getChannelFormatOptions(channel: ColorChannel): Intl.NumberFormatOptions {
    return FORMATS[channel];
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
    const [perceived, chroma, hue] = toOKLCH(this);
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
    const [lightness, chroma, hue] = toOKLCH(this);
    return oklchHueName(lightness, chroma, hue, locale)[0];
  }

  /** The colour as a 24-bit integer, for a canvas or a comparison. */
  toHexInt(): number {
    const rgb = this.toFormat("rgb") as RGBColor;
    return (rgb.red << 16) | (rgb.green << 8) | rgb.blue;
  }

  /** Whether two colours are the same colour, whatever they were written in. */
  isEqual(other: Color): boolean {
    return this.toString("rgba") === other.toString("rgba");
  }
}

// ---------------------------------------------------------------------------
// The three spaces
// ---------------------------------------------------------------------------

export class RGBColor extends Color {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  /**
   * The hue this colour came from, when it came from one.
   *
   * A grey has no hue to recover — 0, 0, 0 is every hue at once — so a
   * conversion out of HSL or HSB carries it, and dragging saturation to zero
   * and back does not spin the wheel to red.
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

  get sourceHue(): number {
    return this.#hue;
  }

  getColorSpace(): ColorSpace {
    return "rgb";
  }

  getColorChannels(): [ColorChannel, ColorChannel, ColorChannel] {
    return ["red", "green", "blue"];
  }

  getChannelValue(channel: ColorChannel): number {
    switch (channel) {
      case "red":
        return this.red;
      case "green":
        return this.green;
      case "blue":
        return this.blue;
      case "alpha":
        return this.alpha;
      default:
        return this.toFormat(channel === "brightness" ? "hsb" : "hsl").getChannelValue(channel);
    }
  }

  withChannelValue(channel: ColorChannel, value: number): Color {
    const range = RANGES[channel];
    const next = clamp(value, range.minValue, range.maxValue);
    switch (channel) {
      case "red":
        return new RGBColor(next, this.green, this.blue, this.alpha, this.#hue);
      case "green":
        return new RGBColor(this.red, next, this.blue, this.alpha, this.#hue);
      case "blue":
        return new RGBColor(this.red, this.green, next, this.alpha, this.#hue);
      case "alpha":
        return new RGBColor(this.red, this.green, this.blue, next, this.#hue);
      default:
        return this.toFormat(channel === "brightness" ? "hsb" : "hsl")
          .withChannelValue(channel, next)
          .toFormat("rgb");
    }
  }

  toFormat(format: ColorFormat): Color {
    switch (format) {
      case "hsl":
      case "hsla":
        return rgbToHsl(this);
      case "hsb":
      case "hsba":
        return rgbToHsb(this);
      default:
        return this;
    }
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
    // Wraps rather than clamps: a hue is an angle, and 370 is 10.
    this.hue = ((hue % 360) + 360) % 360;
    this.saturation = clamp(saturation, 0, 100);
    this.lightness = clamp(lightness, 0, 100);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "hsl";
  }

  getColorChannels(): [ColorChannel, ColorChannel, ColorChannel] {
    return ["hue", "saturation", "lightness"];
  }

  getChannelValue(channel: ColorChannel): number {
    switch (channel) {
      case "hue":
        return this.hue;
      case "saturation":
        return this.saturation;
      case "lightness":
        return this.lightness;
      case "alpha":
        return this.alpha;
      default:
        return (this.toFormat("rgb") as RGBColor).getChannelValue(channel);
    }
  }

  withChannelValue(channel: ColorChannel, value: number): Color {
    const range = RANGES[channel];
    const next = channel === "hue" ? value : clamp(value, range.minValue, range.maxValue);
    switch (channel) {
      case "hue":
        return new HSLColor(next, this.saturation, this.lightness, this.alpha);
      case "saturation":
        return new HSLColor(this.hue, next, this.lightness, this.alpha);
      case "lightness":
        return new HSLColor(this.hue, this.saturation, next, this.alpha);
      case "alpha":
        return new HSLColor(this.hue, this.saturation, this.lightness, next);
      default:
        return (this.toFormat("rgb") as RGBColor).withChannelValue(channel, next).toFormat("hsl");
    }
  }

  toFormat(format: ColorFormat): Color {
    switch (format) {
      case "hsl":
      case "hsla":
        return this;
      case "hsb":
      case "hsba":
        return hslToHsb(this);
      default:
        return hslToRgb(this);
    }
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
    this.hue = ((hue % 360) + 360) % 360;
    this.saturation = clamp(saturation, 0, 100);
    this.brightness = clamp(brightness, 0, 100);
    this.alpha = clamp(alpha, 0, 1);
  }

  getColorSpace(): ColorSpace {
    return "hsb";
  }

  getColorChannels(): [ColorChannel, ColorChannel, ColorChannel] {
    return ["hue", "saturation", "brightness"];
  }

  getChannelValue(channel: ColorChannel): number {
    switch (channel) {
      case "hue":
        return this.hue;
      case "saturation":
        return this.saturation;
      case "brightness":
        return this.brightness;
      case "alpha":
        return this.alpha;
      default:
        return (this.toFormat("rgb") as RGBColor).getChannelValue(channel);
    }
  }

  withChannelValue(channel: ColorChannel, value: number): Color {
    const range = RANGES[channel];
    const next = channel === "hue" ? value : clamp(value, range.minValue, range.maxValue);
    switch (channel) {
      case "hue":
        return new HSBColor(next, this.saturation, this.brightness, this.alpha);
      case "saturation":
        return new HSBColor(this.hue, next, this.brightness, this.alpha);
      case "brightness":
        return new HSBColor(this.hue, this.saturation, next, this.alpha);
      case "alpha":
        return new HSBColor(this.hue, this.saturation, this.brightness, next);
      default:
        return (this.toFormat("rgb") as RGBColor).withChannelValue(channel, next).toFormat("hsb");
    }
  }

  toFormat(format: ColorFormat): Color {
    switch (format) {
      case "hsb":
      case "hsba":
        return this;
      case "hsl":
      case "hsla":
        return hsbToHsl(this);
      default:
        return hsbToRgb(this);
    }
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

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

function hex(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHsl(color: RGBColor): HSLColor {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    // Grey: the hue it CAME from, not zero.
    return new HSLColor(color.sourceHue, 0, lightness * 100, color.alpha);
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
  else if (max === green) hue = ((blue - red) / delta + 2) * 60;
  else hue = ((red - green) / delta + 4) * 60;

  return new HSLColor(hue, saturation * 100, lightness * 100, color.alpha);
}

function hslToRgb(color: HSLColor): RGBColor {
  const hue = color.hue / 360;
  const saturation = color.saturation / 100;
  const lightness = color.lightness / 100;

  if (saturation === 0) {
    const grey = lightness * 255;
    return new RGBColor(grey, grey, grey, color.alpha, color.hue);
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (t: number): number => {
    let at = t;
    if (at < 0) at += 1;
    if (at > 1) at -= 1;
    if (at < 1 / 6) return p + (q - p) * 6 * at;
    if (at < 1 / 2) return q;
    if (at < 2 / 3) return p + (q - p) * (2 / 3 - at) * 6;
    return p;
  };

  return new RGBColor(
    channel(hue + 1 / 3) * 255,
    channel(hue) * 255,
    channel(hue - 1 / 3) * 255,
    color.alpha,
    color.hue,
  );
}

function rgbToHsb(color: RGBColor): HSBColor {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta === 0) return new HSBColor(color.sourceHue, 0, max * 100, color.alpha);

  let hue: number;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
  else if (max === green) hue = ((blue - red) / delta + 2) * 60;
  else hue = ((red - green) / delta + 4) * 60;

  return new HSBColor(hue, (delta / max) * 100, max * 100, color.alpha);
}

function hsbToRgb(color: HSBColor): RGBColor {
  const hue = color.hue / 60;
  const saturation = color.saturation / 100;
  const brightness = color.brightness / 100;

  const sector = Math.floor(hue) % 6;
  const fraction = hue - Math.floor(hue);
  const p = brightness * (1 - saturation);
  const q = brightness * (1 - fraction * saturation);
  const t = brightness * (1 - (1 - fraction) * saturation);

  const triples: [number, number, number][] = [
    [brightness, t, p],
    [q, brightness, p],
    [p, brightness, t],
    [p, q, brightness],
    [t, p, brightness],
    [brightness, p, q],
  ];
  const [red = 0, green = 0, blue = 0] = triples[sector] ?? [];

  return new RGBColor(red * 255, green * 255, blue * 255, color.alpha, color.hue);
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

// https://www.w3.org/TR/css-color-4/#color-conversion-code
function toOKLCH(color: Color): [number, number, number] {
  const rgb = color.toFormat("rgb");
  const [red, green, blue] = [
    rgb.getChannelValue("red"),
    rgb.getChannelValue("green"),
    rgb.getChannelValue("blue"),
  ].map((channel) => toLinear(channel / 255)) as [number, number, number];

  const [x, y, z] = multiply(
    [
      506752 / 1228815,
      87881 / 245763,
      12673 / 70218,
      87098 / 409605,
      175762 / 245763,
      12673 / 175545,
      7918 / 409605,
      87881 / 737289,
      1001167 / 1053270,
    ],
    red,
    green,
    blue,
  );
  const [l, m, s] = multiply(
    [
      0.819022437996703, 0.3619062600528904, -0.1288737815209879, 0.0329836539323885,
      0.9292868615863434, 0.0361446663506424, 0.0481771893596242, 0.2642395317527308,
      0.6335478284694309,
    ],
    x,
    y,
    z,
  );
  const [lightness, a, b] = multiply(
    [
      0.210454268309314, 0.7936177747023054, -0.0040720430116193, 1.9779985324311684,
      -2.4285922420485799, 0.450593709617411, 0.0259040424655478, 0.7827717124575296,
      -0.8086757549230774,
    ],
    Math.cbrt(l),
    Math.cbrt(m),
    Math.cbrt(s),
  );

  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return [lightness, Math.hypot(a, b), hue >= 0 ? hue : hue + 360];
}

function toLinear(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= 0.04045) return value / 12.92;
  return Math.sign(value) * ((magnitude + 0.055) / 1.055) ** 2.4;
}

function multiply(
  matrix: readonly number[],
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const at = (index: number): number => matrix[index] ?? 0;
  return [
    at(0) * x + at(1) * y + at(2) * z,
    at(3) * x + at(4) * y + at(5) * z,
    at(6) * x + at(7) * y + at(8) * z,
  ];
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTION = /^(rgba?|hsla?|hsba?)\(([^)]*)\)$/i;

// `Number` rather than `parseFloat`, which reads "12px" as 12, and a test for
// the empty string, which `Number` reads as 0.
function part(text: string, max: number, value: string): number {
  const trimmed = text.trim();
  const percent = trimmed.endsWith("%");
  const digits = percent ? trimmed.slice(0, -1) : trimmed;
  const parsed = digits.trim() === "" ? Number.NaN : Number(digits);
  if (!Number.isFinite(parsed)) throw new RangeError(`Not a colour: ${JSON.stringify(value)}`);
  return percent ? (parsed / 100) * max : parsed;
}

/**
 * A colour from a string, or a throw naming what was given.
 *
 * Accepts what CSS accepts — `#abc`, `#aabbcc`, `#aabbccdd`, `rgb()`, `rgba()`,
 * `hsl()`, `hsla()` — and `hsb()`/`hsba()`, which CSS does not have but a
 * picker's brightness area is written in.
 */
export function parseColor(value: string): Color {
  const text = value.trim();

  const hexMatch = HEX.exec(text);
  if (hexMatch !== null) {
    const digits = hexMatch[1] as string;
    const expand = (at: number): number =>
      Number.parseInt(
        digits.length <= 4 ? (digits[at] as string).repeat(2) : digits.slice(at * 2, at * 2 + 2),
        16,
      );
    if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) {
      throw new RangeError(`Not a colour: ${JSON.stringify(value)}`);
    }
    const hasAlpha = digits.length === 4 || digits.length === 8;
    return new RGBColor(expand(0), expand(1), expand(2), hasAlpha ? expand(3) / 255 : 1);
  }

  const call = FUNCTION.exec(text);
  if (call === null) throw new RangeError(`Not a colour: ${JSON.stringify(value)}`);

  const name = (call[1] as string).toLowerCase();
  const args = (call[2] as string).split(/[,/]/).map((entry) => entry.trim());
  if (args.length < 3 || args.length > 4) {
    throw new RangeError(`Not a colour: ${JSON.stringify(value)}`);
  }
  const alpha = args.length > 3 ? part(args[3] as string, 1, value) : 1;

  if (name.startsWith("rgb")) {
    return new RGBColor(
      part(args[0] as string, 255, value),
      part(args[1] as string, 255, value),
      part(args[2] as string, 255, value),
      alpha,
    );
  }
  const hue = part((args[0] as string).replace(/deg\s*$/i, ""), 360, value);
  const saturation = part(args[1] as string, 100, value);
  const third = part(args[2] as string, 100, value);
  return name.startsWith("hsl")
    ? new HSLColor(hue, saturation, third, alpha)
    : new HSBColor(hue, saturation, third, alpha);
}

/** Black, as a starting point for a picker with no value. */
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
