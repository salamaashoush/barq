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

const CHANNEL_NAMES: Record<ColorChannel, string> = {
  hue: "Hue",
  saturation: "Saturation",
  brightness: "Brightness",
  lightness: "Lightness",
  red: "Red",
  green: "Green",
  blue: "Blue",
  alpha: "Alpha",
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

  getChannelName(channel: ColorChannel): string {
    return CHANNEL_NAMES[channel];
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
// Reading
// ---------------------------------------------------------------------------

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTION = /^(rgba?|hsla?|hsba?)\(([^)]*)\)$/i;

function part(text: string, max: number): number {
  const trimmed = text.trim();
  if (trimmed.endsWith("%")) return (Number.parseFloat(trimmed) / 100) * max;
  return Number.parseFloat(trimmed);
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
  if (args.length < 3) throw new RangeError(`Not a colour: ${JSON.stringify(value)}`);
  const alpha = args.length > 3 ? part(args[3] as string, 1) : 1;

  if (name.startsWith("rgb")) {
    return new RGBColor(
      part(args[0] as string, 255),
      part(args[1] as string, 255),
      part(args[2] as string, 255),
      alpha,
    );
  }
  const hue = Number.parseFloat(args[0] as string);
  const saturation = part(args[1] as string, 100);
  const third = part(args[2] as string, 100);
  return name.startsWith("hsl")
    ? new HSLColor(hue, saturation, third, alpha)
    : new HSBColor(hue, saturation, third, alpha);
}

/** Black, as a starting point for a picker with no value. */
export function defaultColor(): Color {
  return new HSBColor(0, 100, 100, 1);
}
