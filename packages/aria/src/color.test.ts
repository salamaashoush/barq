import { describe, expect, test } from "bun:test";
import {
  type Color,
  type ColorFormat,
  HSBColor,
  HSLColor,
  HWBColor,
  LabColor,
  LCHColor,
  OKLabColor,
  OKLCHColor,
  RGBColor,
  parseColor,
} from "./color.ts";

function channels(color: Color): number[] {
  return color.getColorChannels().map((channel) => color.getChannelValue(channel));
}

function expectClose(actual: number[], expected: number[], places: number): void {
  expect(actual).toHaveLength(expected.length);
  for (const [at, value] of expected.entries())
    expect(actual[at] ?? NaN).toBeCloseTo(value, places);
}

describe("parseColor", () => {
  test("reads hex, short and long, with and without alpha", () => {
    expect(parseColor("#f00").toString("rgba")).toBe("rgba(255, 0, 0, 1)");
    expect(parseColor("#ff0000").toString("rgba")).toBe("rgba(255, 0, 0, 1)");
    expect(parseColor("#ff000080").toString("hexa")).toBe("#ff000080");
    expect(parseColor("#F00").toString("hex")).toBe("#ff0000");
  });

  test("reads the CSS colour functions", () => {
    expect(parseColor("rgb(255, 0, 0)").toString("hex")).toBe("#ff0000");
    expect(parseColor("rgba(255, 0, 0, 0.5)").getChannelValue("alpha")).toBe(0.5);
    expect(parseColor("hsl(0, 100%, 50%)").toString("hex")).toBe("#ff0000");
    expect(parseColor("hsla(120, 100%, 50%, 0.5)").toString("hex")).toBe("#00ff00");
  });

  test("reads hsb, which CSS has no function for", () => {
    expect(parseColor("hsb(0, 100%, 100%)").toString("hex")).toBe("#ff0000");
    expect(parseColor("hsb(240, 100%, 100%)").toString("hex")).toBe("#0000ff");
  });

  test("anything else throws rather than answering with black", () => {
    expect(() => parseColor("red")).toThrow(RangeError);
    expect(() => parseColor("#ff00")).not.toThrow();
    expect(() => parseColor("#ff0")).not.toThrow();
    expect(() => parseColor("#f")).toThrow(RangeError);
    expect(() => parseColor("rgb(255, 0)")).toThrow(RangeError);
  });
});

describe("parseColor refuses a colour function it cannot read", () => {
  test("a channel that is not a number throws", () => {
    expect(() => parseColor("rgb(a, b, c)")).toThrow(RangeError);
    expect(() => parseColor("rgba(0, 0, 0, abc)")).toThrow(RangeError);
    expect(() => parseColor("rgb(12px, 0, 0)")).toThrow(RangeError);
    expect(() => parseColor("hsl(abc, 10%, 10%)")).toThrow(RangeError);
    expect(() => parseColor("hsb(0, x%, 10%)")).toThrow(RangeError);
  });

  test("an empty channel throws rather than reading as zero", () => {
    expect(() => parseColor("rgb(, , )")).toThrow(RangeError);
    expect(() => parseColor("rgb(255, , 0)")).toThrow(RangeError);
  });

  test("more channels than a colour has throws", () => {
    expect(() => parseColor("rgba(1, 2, 3, 0.5, 9)")).toThrow(RangeError);
  });

  test("a number out of range is clamped, not refused", () => {
    expect(parseColor("rgba(300, -10, 0, 4)").toString("rgba")).toBe("rgba(255, 0, 0, 1)");
  });
});

describe("naming a colour", () => {
  test("the name says lightness, chroma and hue", () => {
    expect(parseColor("hsl(30, 0%, 22.5%)").getColorName("en-US")).toBe("dark gray");
    expect(parseColor("hsl(30, 50%, 100%)").getColorName("en-US")).toBe("white");
    expect(parseColor("hsl(30, 100%, 0%)").getColorName("en-US")).toBe("black");
    expect(parseColor("#E78B8B").getColorName("en-US")).toBe("light red");
    expect(parseColor("#E7E7B8").getColorName("en-US")).toBe("very light pale yellow");
    expect(parseColor("hsl(30, 39%, 25%)").getColorName("en-US")).toBe("dark grayish brown");
    expect(parseColor("hsl(30, 100%, 50%)").getColorName("en-US")).toBe("vibrant orange");
    expect(parseColor("hsb(200, 60%, 62%)").getColorName("en-US")).toBe("grayish cyan blue");
    expect(parseColor("#0000FF").getColorName("en-US")).toBe("dark vibrant blue");
    expect(parseColor("#808000").getColorName("en-US")).toBe("yellow green");
    expect(parseColor("#9932cc").getColorName("en-US")).toBe("dark vibrant purple magenta");
    expect(parseColor("#cd853f").getColorName("en-US")).toBe("brown");
  });

  test("a translucent colour says how transparent it is", () => {
    expect(parseColor("hsba(0, 100%, 100%, 0.2)").getColorName("en-US")).toBe(
      "vibrant red, 80% transparent",
    );
  });

  test("the hue alone has a name too", () => {
    expect(parseColor("hsl(200, 100%, 50%)").getHueName("en-US")).toBe("cyan blue");
    expect(parseColor("#808080").getHueName("en-US")).toBe("gray");
  });

  test("names are in the locale asked for", () => {
    expect(parseColor("#ff0000").getColorName("de-DE")).toBe("lebhaftes rot");
    expect(parseColor("#ff0000").getChannelName("hue", "de-DE")).toBe("Farbton");
    expect(parseColor("#ff0000").getChannelName("saturation", "es-ES")).toBe("Saturación");
  });

  test("a channel name with no locale given is English", () => {
    expect(parseColor("#ff0000").getChannelName("brightness")).toBe("Brightness");
  });
});

describe("converting", () => {
  test("rgb and hsl are each other's inverse", () => {
    const rgb = new RGBColor(64, 128, 192);
    const hsl = rgb.toFormat("hsl");
    expect(hsl.toFormat("rgb").toString("hex")).toBe(rgb.toString("hex"));
  });

  test("rgb and hsb are each other's inverse", () => {
    const rgb = new RGBColor(64, 128, 192);
    const hsb = rgb.toFormat("hsb");
    expect(hsb.toFormat("rgb").toString("hex")).toBe(rgb.toString("hex"));
  });

  test("hsl and hsb are each other's inverse", () => {
    const hsl = new HSLColor(210, 50, 50);
    const back = hsl.toFormat("hsb").toFormat("hsl") as HSLColor;
    expect(Math.round(back.hue)).toBe(210);
    expect(Math.round(back.saturation)).toBe(50);
    expect(Math.round(back.lightness)).toBe(50);
  });

  test("the primaries land where they should", () => {
    expect(new HSBColor(0, 100, 100).toString("hex")).toBe("#ff0000");
    expect(new HSBColor(120, 100, 100).toString("hex")).toBe("#00ff00");
    expect(new HSBColor(240, 100, 100).toString("hex")).toBe("#0000ff");
    expect(new HSBColor(60, 100, 100).toString("hex")).toBe("#ffff00");
  });

  test("a grey keeps the hue it came from", () => {
    // Every grey is the same three numbers, so the hue cannot be recovered
    // from them: dragging saturation to zero and back must not spin the wheel
    // to red.
    const blue = new HSBColor(210, 80, 50);
    const grey = blue.withChannelValue("saturation", 0);
    expect(grey.getChannelValue("hue")).toBe(210);

    const back = grey.toFormat("rgb").toFormat("hsb");
    expect(back.getChannelValue("hue")).toBe(210);
  });
});

describe("channels", () => {
  test("each one knows its own range", () => {
    const color = new HSBColor(210, 50, 50);
    expect(color.getChannelRange("hue")).toEqual({
      minValue: 0,
      maxValue: 360,
      step: 1,
      pageSize: 15,
    });
    expect(color.getChannelRange("red").maxValue).toBe(255);
    expect(color.getChannelRange("alpha")).toEqual({
      minValue: 0,
      maxValue: 1,
      step: 0.01,
      pageSize: 0.1,
    });
  });

  test("a hue wraps rather than clamping", () => {
    // It is an angle: 370 is 10, and -10 is 350.
    expect(new HSLColor(370, 50, 50).hue).toBe(10);
    expect(new HSLColor(-10, 50, 50).hue).toBe(350);
  });

  test("everything else clamps", () => {
    expect(new HSLColor(0, 150, 50).saturation).toBe(100);
    expect(new RGBColor(300, -5, 128).red).toBe(255);
    expect(new RGBColor(300, -5, 128).green).toBe(0);
  });

  test("a channel can be read and written across spaces", () => {
    const rgb = new RGBColor(255, 0, 0);
    expect(Math.round(rgb.getChannelValue("hue"))).toBe(0);

    const green = rgb.withChannelValue("hue", 120);
    expect(green.toString("hex")).toBe("#00ff00");
    // Still an RGB colour: writing a hue does not change what it IS.
    expect(green.getColorSpace()).toBe("rgb");
  });

  test("a colour answers which three channels it is made of", () => {
    expect(new RGBColor(0, 0, 0).getColorChannels()).toEqual(["red", "green", "blue"]);
    expect(new HSLColor(0, 0, 0).getColorChannels()).toEqual(["hue", "saturation", "lightness"]);
    expect(new HSBColor(0, 0, 0).getColorChannels()).toEqual(["hue", "saturation", "brightness"]);
  });
});

describe("printing", () => {
  test("each space prints in its own function, and in CSS", () => {
    expect(new RGBColor(255, 0, 0, 0.5).toString("rgba")).toBe("rgba(255, 0, 0, 0.5)");
    expect(new HSLColor(210, 50, 50).toString("hsl")).toBe("hsl(210, 50%, 50%)");
    expect(new HSBColor(210, 50, 50).toString("hsb")).toBe("hsb(210, 50%, 50%)");
  });

  test("hsb has no CSS function, so its CSS form is hsl", () => {
    expect(new HSBColor(210, 50, 50).toString("css")).toStartWith("hsla(210,");
  });

  test("two colours are equal when they are the same colour", () => {
    expect(parseColor("#ff0000").isEqual(parseColor("hsl(0, 100%, 50%)"))).toBe(true);
    expect(parseColor("#ff0000").isEqual(parseColor("#00ff00"))).toBe(false);
  });

  test("the hex integer is the three channels packed", () => {
    expect(parseColor("#ff8000").toHexInt()).toBe(0xff8000);
  });
});

// Reference values: CSS Color 4's sample conversions (the same matrices and
// transfer functions), its worked examples, and color.js, whose "css" gamut
// mapping is the algorithm the spec gives.
describe("perceptual spaces against CSS Color 4", () => {
  test("sRGB primaries in OKLCH, OKLab, Lab and LCH", () => {
    const red = parseColor("#ff0000");
    expectClose(channels(red.toFormat("oklch")), [0.627955, 0.257683, 29.23388], 5);
    expectClose(channels(red.toFormat("oklab")), [0.627955, 0.224863, 0.125846], 5);
    expectClose(channels(red.toFormat("lab")), [54.290541, 80.804928, 69.890965], 4);
    expectClose(channels(red.toFormat("lch")), [54.290541, 106.837182, 40.857657], 4);

    expectClose(
      channels(parseColor("#00ff00").toFormat("oklch")),
      [0.86644, 0.294827, 142.4953],
      4,
    );
    expectClose(
      channels(parseColor("#0000ff").toFormat("oklch")),
      [0.452014, 0.313214, 264.052],
      4,
    );
  });

  test("the spec's own examples convert to the sRGB colours it shows", () => {
    expect(parseColor("lab(29.2345% 39.3825 20.0664)").toString("hex")).toBe("#7d2329");
    expect(parseColor("lch(67.5345% 42.5 258.2)").toString("hex")).toBe("#62acef");
    expect(parseColor("oklab(54.43237% 0.0681665 -0.1656703)").toString("hex")).toBe("#7654cd");
    expect(parseColor("oklch(42.1% 48.25% 328.4)").toString("hex")).toBe("#800180");
    expectClose(channels(parseColor("#7654cd").toFormat("lab")), [44.35772, 36.0479, -58.9859], 3);
    expectClose(
      channels(parseColor("#7654cd").toFormat("oklab")),
      [0.5443237, 0.0681665, -0.1656703],
      4,
    );
  });

  test("hwb is a hue with white and black mixed in", () => {
    expect(parseColor("hwb(90 10% 20%)").toString("hex")).toBe("#73cc1a");
    // White and black past 100% between them are a grey, in their proportion.
    expect(parseColor("hwb(90 60% 60%)").toString("hex")).toBe("#808080");
    expectClose(channels(parseColor("#7654cd").toFormat("hwb")), [256.8595, 32.9412, 19.6078], 3);
  });

  test("every space round-trips through every other", () => {
    const spaces: ColorFormat[] = ["rgb", "hsl", "hsb", "hwb", "lab", "lch", "oklab", "oklch"];
    for (const hex of ["#ff0000", "#3d7a9c", "#f0e68c", "#123456", "#fefefe", "#010203"]) {
      for (const from of spaces) {
        for (const to of spaces) {
          const through = parseColor(hex).toFormat(from).toFormat(to).toFormat(from);
          expect(through.toString("hex")).toBe(hex);
        }
      }
    }
  });

  test("the perceptual spaces round-trip without the 8-bit step", () => {
    const start = parseColor("oklch(0.62 0.15 250)");
    expectClose(channels(start.toFormat("lab").toFormat("oklch")), [0.62, 0.15, 250], 6);
    expectClose(channels(start.toFormat("oklab").toFormat("oklch")), [0.62, 0.15, 250], 9);
    const lab = parseColor("lab(40 20 -30)");
    expectClose(channels(lab.toFormat("lch").toFormat("lab")), [40, 20, -30], 9);
    expectClose(channels(lab.toFormat("oklch").toFormat("lab")), [40, 20, -30], 6);
  });

  test("a grey keeps its hue through every space without one", () => {
    const grey = parseColor("oklch(0.5 0 210)");
    for (const through of ["rgb", "lab", "oklab", "hsl", "lch"] as const) {
      expect(grey.toFormat(through).toFormat("oklch").getChannelValue("hue")).toBe(210);
    }
    expect(parseColor("lch(50 0 140)").toFormat("lab").toFormat("lch").getChannelValue("hue")).toBe(
      140,
    );
    expect(
      parseColor("hwb(75 60% 40%)").toFormat("rgb").toFormat("hwb").getChannelValue("hue"),
    ).toBe(75);
    // Chroma to zero and back does not spin the hue to red.
    const tint = parseColor("oklch(0.6 0.1 300)").withChannelValue("chroma", 0);
    expect(
      tint.toFormat("rgb").toFormat("oklch").withChannelValue("chroma", 0.1).getChannelValue("hue"),
    ).toBe(300);
  });
});

describe("reading the CSS Color 4 functions", () => {
  test("numbers and percentages, each against its own reference range", () => {
    expectClose(channels(parseColor("oklch(62.8% 0.2577 29.23 / 50%)")), [0.628, 0.2577, 29.23], 9);
    expect(parseColor("oklch(62.8% 0.2577 29.23 / 50%)").alpha).toBe(0.5);
    expectClose(channels(parseColor("oklch(0.5 50% 10)")), [0.5, 0.2, 10], 9);
    expectClose(channels(parseColor("oklab(50% 100% -50%)")), [0.5, 0.4, -0.2], 9);
    expectClose(channels(parseColor("lab(50% 100% -100%)")), [50, 125, -125], 9);
    expectClose(channels(parseColor("lch(50 100% 30)")), [50, 150, 30], 9);
    expectClose(channels(parseColor("hwb(90 10 20)")), [90, 10, 20], 9);
    expect(parseColor("OKLCH(0.5 0.1 30)").getColorSpace()).toBe("oklch");
  });

  test("a hue takes any angle unit", () => {
    expect(parseColor("oklch(0.5 0.1 0.5turn)").getChannelValue("hue")).toBeCloseTo(180, 9);
    expect(parseColor("lch(50 30 200grad)").getChannelValue("hue")).toBeCloseTo(180, 9);
    expect(parseColor("hwb(3.14159265358979rad 0% 0%)").getChannelValue("hue")).toBeCloseTo(180, 9);
    expect(parseColor("oklch(0.5 0.1 -90deg)").getChannelValue("hue")).toBe(270);
  });

  test("none is a missing component, read as zero", () => {
    expect(channels(parseColor("oklch(none none none)"))).toEqual([0, 0, 0]);
    expect(parseColor("lab(50 none 10 / none)").alpha).toBe(0);
    expect(parseColor("hsl(none 0% 50%)").toString("hex")).toBe("#808080");
  });

  test("lightness and chroma clamp as CSS clamps them; the axes do not", () => {
    expect(parseColor("oklch(120% 0.1 30)").getChannelValue("lightness")).toBe(1);
    expect(parseColor("lab(-10 0 0)").getChannelValue("lightness")).toBe(0);
    expect(parseColor("lch(50 -20 30)").getChannelValue("chroma")).toBe(0);
    expect(parseColor("lab(50 160 -170)").getChannelValue("greenRed")).toBe(160);
    expect(parseColor("oklch(0.5 0.6 30)").getChannelValue("chroma")).toBe(0.6);
  });

  test("rgb and hsl read the space-separated form too", () => {
    expect(parseColor("rgb(255 0 0 / 50%)").toString("rgba")).toBe("rgba(255, 0, 0, 0.5)");
    expect(parseColor("hsl(120deg 100% 50%)").toString("hex")).toBe("#00ff00");
  });

  test("what CSS refuses, this refuses", () => {
    for (const text of [
      "oklch(0.5, 0.1, 30)",
      "lab(50, 0, 0)",
      "oklch(0.5 0.1)",
      "oklch(0.5 0.1 30 40)",
      "oklch(0.5 0.1 30px)",
      "oklch(0.5 0.1 30%)",
      "oklch(0.5 0.1 30 /)",
      "oklch(0.5 0.1 30 / 1 / 1)",
      "lab(50 x 0)",
      "rgb(none, 0, 0)",
      "hwb(90, 10%, 20%)",
      "color(srgb 1 0 0)",
    ]) {
      expect(() => parseColor(text)).toThrow(RangeError);
    }
  });
});

describe("printing the CSS Color 4 functions", () => {
  test("as CSS serialises them: numbers, trailing zeroes dropped, alpha only when not 1", () => {
    expect(parseColor("lab(56.200% 0.000 66.88%)").toString()).toBe("lab(56.2 0 83.6)");
    expect(parseColor("lch(37% 105.0 305.00)").toString()).toBe("lch(37 105 305)");
    expect(parseColor("lch(56.2% 83.6 357.4 /93%)").toString()).toBe("lch(56.2 83.6 357.4 / 0.93)");
    expect(parseColor("oklab(54.0% -0.10 -0.02)").toString()).toBe("oklab(0.54 -0.1 -0.02)");
    expect(parseColor("oklch(56.43% 0.0900 123.40)").toString()).toBe("oklch(0.5643 0.09 123.4)");
    expect(parseColor("hwb(90 10% 20% / 0.5)").toString()).toBe("hwb(90 10% 20% / 0.5)");
  });

  test("any colour prints in any of them", () => {
    const red = parseColor("#ff0000");
    expect(red.toString("oklch")).toBe("oklch(0.62796 0.25768 29.234)");
    expect(red.toString("oklab")).toBe("oklab(0.62796 0.22486 0.12585)");
    expect(red.toString("lab")).toBe("lab(54.291 80.805 69.891)");
    expect(red.toString("lch")).toBe("lch(54.291 106.837 40.858)");
    expect(red.toString("hwb")).toBe("hwb(0 0% 0%)");
  });
});

describe("gamut mapping into sRGB", () => {
  // color.js's "css" method; plain clipping would give the second value.
  const cases: [string, string, string][] = [
    ["oklch(0.7 0.4 30)", "#ff5843", "#ff0000"],
    ["oklch(0.5 0.4 140)", "#007a00", "#008900"],
    ["oklch(0.85 0.4 264)", "#aeceff", "#39a5ff"],
    ["oklch(0.95 0.4 320)", "#ffe0ff", "#ff62ff"],
    ["oklch(0.3 0.4 90)", "#3d2b00", "#710000"],
    ["oklch(0.6 0.3 200)", "#00959d", "#00a9c5"],
    ["lch(50 150 300)", "#5f76ff", "#5641ff"],
    ["lab(60 120 -100)", "#e75dff", "#ff00ff"],
  ];

  test("lowers chroma in OKLCH rather than clipping each channel", () => {
    for (const [given, mapped, clipped] of cases) {
      const hex = parseColor(given).toString("hex");
      expect(hex).toBe(mapped);
      expect(hex).not.toBe(clipped);
    }
  });

  test("keeps the lightness and hue it can", () => {
    const mapped = parseColor("oklch(0.7 0.4 30)").toFormat("rgb").toFormat("oklch");
    expect(mapped.getChannelValue("lightness")).toBeCloseTo(0.683, 2);
    expect(mapped.getChannelValue("hue")).toBeCloseTo(30, 0);
    expect(mapped.getChannelValue("chroma")).toBeLessThan(0.21);
  });

  test("leaves a colour already in gamut alone", () => {
    expect(parseColor("oklch(0.7 0.2 30)").toString("hex")).toBe("#ff614d");
  });

  test("past white is white and past black is black", () => {
    expect(parseColor("oklch(1 0.1 30)").toString("hex")).toBe("#ffffff");
    expect(parseColor("oklch(0 0.1 30)").toString("hex")).toBe("#000000");
  });

  test("the sRGB spaces get the mapped colour too", () => {
    const hsl = parseColor("oklch(0.7 0.4 30)").toFormat("hsl");
    expect(hsl.toString("hex")).toBe("#ff5843");
    expect(hsl.getChannelValue("saturation")).toBeLessThanOrEqual(100);
  });
});

describe("channels per space", () => {
  test("a channel's range is its space's", () => {
    expect(new HSLColor(0, 0, 50).getChannelRange("lightness")).toEqual({
      minValue: 0,
      maxValue: 100,
      step: 1,
      pageSize: 10,
    });
    expect(new OKLCHColor(0.5, 0.1, 30).getChannelRange("lightness")).toEqual({
      minValue: 0,
      maxValue: 1,
      step: 0.001,
      pageSize: 0.05,
    });
    expect(new LabColor(50, 0, 0).getChannelRange("lightness").maxValue).toBe(100);
    expect(new LabColor(50, 0, 0).getChannelRange("greenRed")).toEqual({
      minValue: -125,
      maxValue: 125,
      step: 0.1,
      pageSize: 5,
    });
    expect(new OKLabColor(0.5, 0, 0).getChannelRange("blueYellow").minValue).toBe(-0.4);
    expect(new LCHColor(50, 0, 0).getChannelRange("chroma").maxValue).toBe(150);
    expect(new OKLCHColor(0.5, 0, 0).getChannelRange("chroma").maxValue).toBe(0.4);
    expect(new HWBColor(0, 0, 0).getChannelRange("whiteness").maxValue).toBe(100);
  });

  test("each space is made of its own three channels", () => {
    expect(new HWBColor(0, 0, 0).getColorChannels()).toEqual(["hue", "whiteness", "blackness"]);
    expect(new LabColor(0, 0, 0).getColorChannels()).toEqual([
      "lightness",
      "greenRed",
      "blueYellow",
    ]);
    expect(new LCHColor(0, 0, 0).getColorChannels()).toEqual(["lightness", "chroma", "hue"]);
    expect(new OKLabColor(0, 0, 0).getColorChannels()).toEqual([
      "lightness",
      "greenRed",
      "blueYellow",
    ]);
    expect(new OKLCHColor(0, 0, 0).getColorChannels()).toEqual(["lightness", "chroma", "hue"]);
  });

  test("a channel the space lacks is read in the nearest space that has it", () => {
    const lab = parseColor("lab(54.29 80.8 69.89)");
    // Lab's hue is LCH's, not HSL's.
    expect(lab.getChannelValue("hue")).toBeCloseTo(40.86, 1);
    expect(lab.getChannelValue("chroma")).toBeCloseTo(106.84, 1);
    const oklch = parseColor("oklch(0.628 0.2577 29.23)");
    expect(oklch.getChannelValue("greenRed")).toBeCloseTo(0.2249, 3);
    const rgb = parseColor("#ff0000");
    expect(rgb.getChannelValue("chroma")).toBeCloseTo(0.2577, 3);
    expect(rgb.getChannelRange("chroma").maxValue).toBe(0.4);
    expect(rgb.getChannelValue("lightness")).toBe(50);
  });

  test("writing a channel clamps to its space's range, and the hue wraps", () => {
    const color = new OKLCHColor(0.5, 0.1, 30);
    expect(color.withChannelValue("lightness", 3).getChannelValue("lightness")).toBe(1);
    expect(color.withChannelValue("chroma", 2).getChannelValue("chroma")).toBe(0.4);
    expect(color.withChannelValue("hue", 390).getChannelValue("hue")).toBe(30);
    const moved = parseColor("#ff0000").withChannelValue("chroma", 0.1);
    expect(moved.getColorSpace()).toBe("rgb");
    expect(moved.getChannelValue("chroma")).toBeCloseTo(0.1, 2);
  });

  test("names are the CSS ones, and localised", () => {
    const color = new LabColor(50, 0, 0);
    expect(color.getChannelName("chroma")).toBe("Chroma");
    expect(color.getChannelName("greenRed")).toBe("Green-red");
    expect(color.getChannelName("blueYellow")).toBe("Blue-yellow");
    expect(color.getChannelName("whiteness")).toBe("Whiteness");
    expect(color.getChannelName("blackness", "de-DE")).toBe("Schwarzanteil");
    expect(color.getChannelName("chroma", "ja-JP")).toBe("クロマ");
  });

  test("values are written the way each space writes them", () => {
    const red = parseColor("#ff0000");
    expect(red.toFormat("oklch").formatChannelValue("lightness")).toBe("62.8%");
    expect(red.toFormat("oklch").formatChannelValue("chroma")).toBe("0.258");
    expect(red.toFormat("lab").formatChannelValue("lightness")).toBe("54.3%");
    expect(red.toFormat("lab").formatChannelValue("greenRed")).toBe("80.8");
    expect(red.toFormat("hwb").formatChannelValue("whiteness")).toBe("0%");
    expect(red.toFormat("hsl").formatChannelValue("lightness")).toBe("50%");
  });

  test("perceptual colours are equal to the step they can be edited by", () => {
    const color = parseColor("oklch(0.5 0.1 30)");
    expect(color.isEqual(parseColor("oklch(0.501 0.1 30)"))).toBe(false);
    expect(color.isEqual(parseColor(color.toString("oklch")))).toBe(true);
    expect(color.isEqual(color.toFormat("lab"))).toBe(true);
    // Two colours past sRGB that map to one sRGB colour are still two.
    expect(parseColor("oklch(0.7 0.4 30)").isEqual(parseColor("oklch(0.7 0.38 30)"))).toBe(false);
    // One colour written in two spaces is one colour.
    expect(parseColor("#7654cd").isEqual(parseColor("oklab(54.43237% 0.0681665 -0.1656703)"))).toBe(
      true,
    );
  });
});
