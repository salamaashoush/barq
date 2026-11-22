import { describe, expect, test } from "bun:test";
import { HSBColor, HSLColor, RGBColor, parseColor } from "./color.ts";

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
