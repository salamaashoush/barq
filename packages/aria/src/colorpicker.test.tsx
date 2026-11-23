import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { parseColor, type Color } from "./color.ts";
import { ColorSwatchPicker, ColorSwatchPickerItem } from "./colorswatchpicker.tsx";
import { provideDirection, provideLocale } from "./i18n.ts";
import {
  ColorArea,
  colorAreaGradient,
  colorAreaState,
  type ColorAreaStateOptions,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorWheel,
} from "./colorpicker.tsx";

describe("ColorSlider", () => {
  function Hue(props: { onChange?: (value: Color) => void }) {
    return (
      <ColorSlider channel="hue" defaultValue="hsb(180, 100%, 100%)" onChange={props.onChange} />
    );
  }

  test("is a range input named for its channel", () => {
    render(() => <Hue />);

    const input = screen.getByRole<HTMLInputElement>("slider");
    expect(input.type).toBe("range");
    expect(accessibleName(input)).toBe("Hue");
  });

  test("the channel's own range is what it moves in", () => {
    render(() => <Hue />);

    const input = screen.getByRole<HTMLInputElement>("slider");
    expect(input.min).toBe("0");
    expect(input.max).toBe("360");
    expect(input.value).toBe("180");
  });

  test("the value is said in words, not just as a number", () => {
    render(() => <Hue />);
    // "180" is not a colour; "Hue 180" is.
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("Hue 180");
  });

  test("moving it changes only that channel", () => {
    const changes: Color[] = [];
    render(() => <Hue onChange={(value) => changes.push(value)} />);

    const input = screen.getByRole<HTMLInputElement>("slider");
    input.value = "240";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes.at(-1)?.getChannelValue("hue")).toBe(240);
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(100);
  });

  test("Page Up moves by the channel's page size", () => {
    const changes: Color[] = [];
    render(() => <Hue onChange={(value) => changes.push(value)} />);

    user.focus(screen.getByRole("slider"));
    user.keyDown("PageUp");
    flush();

    expect(changes.at(-1)?.getChannelValue("hue")).toBe(195);
  });

  test("an alpha slider counts in percent", () => {
    render(() => <ColorSlider channel="alpha" defaultValue="rgba(255, 0, 0, 0.5)" />);

    const input = screen.getByRole<HTMLInputElement>("slider");
    expect(input.max).toBe("1");
    expect(input.getAttribute("aria-valuetext")).toBe("Alpha 50%");
  });

  test("a disabled slider does not move", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorSlider
        channel="hue"
        defaultValue="hsb(180, 100%, 100%)"
        isDisabled
        onChange={(value) => changes.push(value)}
      />
    ));

    const input = screen.getByRole<HTMLInputElement>("slider");
    expect(input.disabled).toBe(true);

    input.value = "240";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(changes).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Hue />);
    expectNoAriaViolations(container);
  });
});

describe("ColorArea", () => {
  test("is two sliders in one element, one per axis", () => {
    render(() => <ColorArea defaultValue="hsb(180, 50%, 60%)" />);

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    expect(accessibleName(sliders[0] as HTMLElement)).toBe("Saturation");
    expect(accessibleName(sliders[1] as HTMLElement)).toBe("Brightness");
  });

  test("the container hands the arrow keys over", () => {
    render(() => <ColorArea defaultValue="hsb(180, 50%, 60%)" />);

    const area = screen.getByRole("application");
    expect(area.getAttribute("aria-roledescription")).toBe("2D slider");
  });

  test("both axes are announced from either slider", () => {
    render(() => <ColorArea defaultValue="hsb(180, 50%, 60%)" />);

    for (const slider of screen.getAllByRole("slider")) {
      expect(slider.getAttribute("aria-valuetext")).toBe("Saturation 50, Brightness 60");
    }
  });

  test("each axis moves its own channel", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorArea defaultValue="hsb(180, 50%, 60%)" onChange={(value) => changes.push(value)} />
    ));

    const [x, y] = screen.getAllByRole<HTMLInputElement>("slider");
    (x as HTMLInputElement).value = "80";
    (x as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(80);
    expect(changes.at(-1)?.getChannelValue("brightness")).toBe(60);

    (y as HTMLInputElement).value = "20";
    (y as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(changes.at(-1)?.getChannelValue("brightness")).toBe(20);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <ColorArea defaultValue="hsb(180, 50%, 60%)" />);
    expectNoAriaViolations(container);
  });
});

describe("a colour area's gradient", () => {
  function gradient(
    options: ColorAreaStateOptions,
    direction?: "ltr" | "rtl",
  ): { area: Record<string, string>; thumb: Record<string, string> } {
    let area: Record<string, string> = {};
    let thumb: Record<string, string> = {};
    render(() => {
      const state = colorAreaState(options);
      const { colorAreaStyleProps, thumbStyleProps } = colorAreaGradient({ state, direction });
      area = colorAreaStyleProps.style();
      thumb = thumbStyleProps.style();
      return null;
    });
    return { area, thumb };
  }

  test("saturation across and brightness up, over the hue", () => {
    const { area } = gradient({ defaultValue: "hsb(120, 50%, 50%)" });
    expect(area.background).toBe(
      [
        "linear-gradient(to top, black, transparent)",
        "linear-gradient(to right, hsla(120, 0%, 100%, 1), transparent)",
        "hsla(120, 100%, 50%, 1)",
      ].join(", "),
    );
    expect(area["forced-color-adjust"]).toBe("none");
    expect(area["touch-action"]).toBe("none");
  });

  test("right to left, the x axis runs the other way", () => {
    const { area, thumb } = gradient({ defaultValue: "hsb(120, 25%, 50%)" }, "rtl");
    expect(area.background).toContain("linear-gradient(to left, hsla(120, 0%, 100%, 1)");
    expect(thumb.left).toBe("75%");
    expect(thumb.top).toBe("50%");
  });

  test("hue across a brightness-fixed HSB area", () => {
    const { area } = gradient({
      defaultValue: "hsb(0, 100%, 40%)",
      xChannel: "hue",
      yChannel: "saturation",
    });
    expect(area.background).toBe(
      [
        "linear-gradient(to top, hsla(0, 0%, 40%, 1), transparent)",
        `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
          .map((hue) => parseColor(`hsb(${hue}, 100%, 40%)`).toString("css"))
          .join(", ")})`,
      ].join(", "),
    );
  });

  test("an HSL area fades lightness through black and white", () => {
    const { area } = gradient({
      defaultValue: "hsl(200, 60%, 50%)",
      xChannel: "saturation",
      yChannel: "lightness",
    });
    expect(area.background).toBe(
      [
        "linear-gradient(to top, black, transparent, white)",
        "linear-gradient(to right, hsla(200, 0%, 50%, 1), transparent)",
        "hsla(200, 100%, 50%, 1)",
      ].join(", "),
    );
  });

  test("an HSL area at a fixed saturation has no flat colour under it", () => {
    const { area } = gradient({
      defaultValue: "hsl(200, 60%, 50%)",
      xChannel: "hue",
      yChannel: "lightness",
    });
    const layers = area.background?.split(/, (?=linear-gradient)/) ?? [];
    expect(layers).toHaveLength(2);
    expect(layers[0]).toBe("linear-gradient(to top, black, transparent, white)");
    expect(layers[1]).toStartWith("linear-gradient(to right, hsla(0, 60%, 50%, 1), ");
  });

  test("an RGB area screens one layer per channel", () => {
    const { area } = gradient({
      defaultValue: "rgb(10, 20, 30)",
      xChannel: "red",
      yChannel: "green",
    });
    expect(area.background).toBe(
      [
        "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(255, 0, 0, 1))",
        "linear-gradient(to top, rgba(0, 0, 0, 1), rgba(0, 255, 0, 1))",
        "rgba(0, 0, 30, 1)",
      ].join(", "),
    );
    expect(area["background-blend-mode"]).toBe("screen");
  });

  test("the third channel is the one neither axis holds, and moves the background", () => {
    const { area } = gradient({
      defaultValue: "rgb(10, 20, 30)",
      xChannel: "blue",
      yChannel: "red",
    });
    expect(area.background).toContain("rgba(0, 20, 0, 1)");
  });

  test("one axis given pushes the other off its channel", () => {
    let channels: string[] = [];
    render(() => {
      const state = colorAreaState({ defaultValue: "hsb(0, 50%, 50%)", yChannel: "saturation" });
      channels = [state.xChannel(), state.yChannel(), state.zChannel()];
      return null;
    });
    expect(channels).toEqual(["brightness", "saturation", "hue"]);
  });

  test("a disabled area has no gradient", () => {
    const { area } = gradient({ defaultValue: "hsb(120, 50%, 50%)", isDisabled: true });
    expect(area.background).toBeUndefined();
    expect(area.position).toBe("relative");
  });

  test("ColorArea draws it, keeps it under a style of the caller's, and fills the thumb", () => {
    const { container } = render(() => (
      <ColorArea defaultValue="hsba(120, 50%, 50%, 0.5)" style={{ width: "192px" }} />
    ));
    const area = container.querySelector<HTMLElement>("[role=application]");
    const style = area?.getAttribute("style") ?? "";
    expect(style).toContain("linear-gradient");
    expect(style).toContain("width: 192px");
    const thumb = area?.firstElementChild as HTMLElement;
    expect(thumb.getAttribute("style")).toContain(
      `background-color: ${parseColor("hsb(120, 50%, 50%)").toString("css")}`,
    );
  });
});

describe("ColorField", () => {
  test("shows the colour as text", () => {
    render(() => <ColorField label="Hex" defaultValue="#7f00ff" />);
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("#7f00ff");
  });

  test("commits on blur, not as you type", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));

    const input = screen.getByRole<HTMLInputElement>("textbox");
    user.focus(input);
    input.value = "#00ff00";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    // "#00ff" was a prefix on the way here, and reporting one would flash the
    // page through every one of them.
    expect(changes).toEqual([]);

    user.blur(input);
    flush();
    expect(changes.at(-1)?.toString("hex")).toBe("#00ff00");
  });

  test("Enter commits too", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));

    const input = screen.getByRole<HTMLInputElement>("textbox");
    user.focus(input);
    input.value = "#0000ff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    user.keyDown("Enter");
    flush();

    expect(changes.at(-1)?.toString("hex")).toBe("#0000ff");
  });

  test("text that is not a colour goes back to what the field holds", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));

    const input = screen.getByRole<HTMLInputElement>("textbox");
    user.focus(input);
    input.value = "not a colour";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    user.blur(input);
    flush();

    expect(input.value).toBe("#7f00ff");
    expect(changes).toEqual([]);
  });
});

describe("ColorField with a channel", () => {
  test("shows the one channel, formatted, named for it, with the number in a hidden input", () => {
    render(() => <ColorField value="#abc" colorSpace="hsl" channel="hue" name="hue" />);

    const field = screen.getByRole<HTMLInputElement>("textbox");
    expect(field.value).toBe("210°");
    expect(accessibleName(field)).toBe("Hue");
    expect(field.getAttribute("data-channel")).toBe("hue");
    expect(field.hasAttribute("name")).toBe(false);

    const hidden = document.querySelector<HTMLInputElement>("input[name=hue]");
    expect(hidden?.type).toBe("hidden");
    expect(hidden?.value).toBe("210");
  });

  test("a typed channel is written back into the colour, in the field's space", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField
        value="#abc"
        colorSpace="hsl"
        channel="hue"
        onChange={(value) => changes.push(value)}
      />
    ));

    const field = screen.getByRole<HTMLInputElement>("textbox");
    user.clear(field);
    user.type(field, "100");
    user.blur(field);
    flush();

    expect(changes.at(-1)?.getColorSpace()).toBe("hsl");
    expect(changes.at(-1)?.toString("hsla")).toBe(
      parseColor("hsl(100, 25%, 73.33%)").toString("hsla"),
    );
  });

  test("defaults to empty, and a null value is empty", () => {
    render(() => (
      <>
        <ColorField colorSpace="hsl" channel="hue" aria-label="first" />
        <ColorField value={null} colorSpace="hsl" channel="hue" aria-label="second" />
      </>
    ));
    for (const field of screen.getAllByRole<HTMLInputElement>("textbox")) {
      expect(field.value).toBe("");
    }
  });

  test("clearing it empties the colour", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField
        defaultValue="#abc"
        colorSpace="hsl"
        channel="hue"
        onChange={(value) => changes.push(value)}
      />
    ));

    const field = screen.getByRole<HTMLInputElement>("textbox");
    expect(field.value).toBe("210°");
    user.focus(field);
    user.clear(field);
    user.blur(field);
    flush();

    expect(field.value).toBe("");
    expect(changes).toEqual([null]);
  });

  test("a percent channel counts in its own percent", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField
        defaultValue="hsl(210, 25%, 73%)"
        channel="saturation"
        onChange={(value) => changes.push(value)}
      />
    ));

    const field = screen.getByRole<HTMLInputElement>("textbox");
    expect(field.value).toBe("25%");
    expect(accessibleName(field)).toBe("Saturation");

    user.focus(field);
    user.keyDown("ArrowUp");
    flush();
    expect(field.value).toBe("26%");
    expect(changes.at(-1)?.getChannelValue("saturation")).toBeCloseTo(26, 6);
  });

  test("the channel's range bounds it", () => {
    render(() => <ColorField defaultValue="#ff0000" channel="red" />);
    const field = screen.getByRole<HTMLInputElement>("textbox");

    user.focus(field);
    user.keyDown("ArrowUp");
    flush();
    expect(field.value).toBe("255");
    user.keyDown("Home");
    flush();
    expect(field.value).toBe("0");
  });

  test("a label of its own replaces the channel's name", () => {
    render(() => <ColorField label="Tint" defaultValue="#abc" colorSpace="hsl" channel="hue" />);
    const field = screen.getByRole<HTMLInputElement>("textbox");
    expect(accessibleName(field)).toBe("Tint");
    expect(field.hasAttribute("aria-label")).toBe(false);
  });

  test("the channel's name is localised", () => {
    function German() {
      provideLocale("de-DE");
      return <ColorField defaultValue="#abc" colorSpace="hsl" channel="hue" />;
    }
    render(() => <German />);
    expect(accessibleName(screen.getByRole("textbox"))).toBe("Farbton");
  });

  test("a form reset goes back to the starting colour", () => {
    const { container } = render(() => {
      const [value, setValue] = createSignal<Color | null>(parseColor("#ff0"));
      return (
        <form>
          <ColorField channel="red" value={value()} onChange={setValue} />
        </form>
      );
    });

    const field = screen.getByRole<HTMLInputElement>("textbox");
    expect(field.value).toBe("255");
    user.clear(field);
    user.type(field, "0");
    user.blur(field);
    flush();
    expect(field.value).toBe("0");

    (container.querySelector("form") as HTMLFormElement).reset();
    flush();
    expect(field.value).toBe("255");
  });

  test("form reaches the hidden input", () => {
    render(() => <ColorField defaultValue="#abc" channel="red" name="red" form="acme" />);
    const hidden = document.querySelector<HTMLInputElement>("input[name=red]");
    expect(hidden?.getAttribute("form")).toBe("acme");
    expect(hidden?.value).toBe("170");
  });

  test("inside a picker it edits the picker's colour", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorPicker defaultValue="#ff0000" onChange={(value) => changes.push(value)}>
        <ColorField channel="hue" colorSpace="hsb" />
        <ColorSwatch />
      </ColorPicker>
    ));

    const field = screen.getByRole<HTMLInputElement>("textbox");
    expect(field.value).toBe("0°");
    user.clear(field);
    user.type(field, "240");
    user.keyDown("Enter");
    flush();

    expect(changes.at(-1)?.toString("hex")).toBe("#0000ff");
  });

  test("the hex field says it is one", () => {
    render(() => <ColorField label="Hex" defaultValue="#abc" />);
    expect(screen.getByRole("textbox").getAttribute("data-channel")).toBe("hex");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <ColorField defaultValue="#abc" colorSpace="hsl" channel="lightness" />
    ));
    expectNoAriaViolations(container);
  });
});

describe("ColorSwatch", () => {
  test("is an image named with the colour it shows", () => {
    render(() => <ColorSwatch color="#ff0000" />);

    const swatch = screen.getByRole("img");
    // An unlabelled coloured square is invisible to anyone not looking at it.
    expect(accessibleName(swatch)).toBe("0 degrees, 100% saturation, 50% lightness");
  });

  test("a name of its own wins", () => {
    render(() => <ColorSwatch color="#ff0000" aria-label="Brand red" />);
    expect(accessibleName(screen.getByRole("img"))).toBe("Brand red");
  });
});

describe("ColorPicker", () => {
  test("every control inside edits one colour", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorPicker defaultValue="hsb(180, 50%, 60%)" onChange={(value) => changes.push(value)}>
        <ColorArea />
        <ColorSlider channel="hue" />
        <ColorSwatch />
      </ColorPicker>
    ));

    const hue = screen.getByRole<HTMLInputElement>("slider", { name: "Hue" });
    expect(hue.value).toBe("180");

    hue.value = "300";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes.at(-1)?.getChannelValue("hue")).toBe(300);
    // The area followed: it is the same colour.
    const area = screen.getByRole<HTMLInputElement>("slider", { name: "Saturation" });
    expect(area.value).toBe("50");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <ColorPicker defaultValue={parseColor("#7f00ff")}>
        <ColorArea />
        <ColorSlider channel="hue" />
        <ColorField label="Hex" />
        <ColorSwatch />
      </ColorPicker>
    ));
    expectNoAriaViolations(container);
  });
});

describe("ColorWheel", () => {
  function wheel(): HTMLInputElement {
    return screen.getByRole<HTMLInputElement>("slider");
  }

  test("is a hue slider, named and spoken as one", () => {
    render(() => <ColorWheel defaultValue="hsl(30, 100%, 50%)" />);

    expect(wheel().type).toBe("range");
    expect(wheel().value).toBe("30");
    expect(accessibleName(wheel())).toBe("Hue");
    expect(wheel().getAttribute("aria-valuetext")).toBe("Hue 30");
  });

  test("the arrows turn it, and 360 comes back round to 0", () => {
    const seen: string[] = [];
    render(() => (
      <ColorWheel
        defaultValue="hsl(359, 100%, 50%)"
        onChange={(value: Color) => seen.push(value.toString("hsl"))}
      />
    ));

    user.focus(wheel());
    user.key("ArrowRight");
    flush();

    // 359 + 1 is 360, which IS 0: the wheel turns rather than stopping at a
    // seam the user cannot see.
    expect(wheel().value).toBe("0");
    expect(seen.at(-1)).toContain("hsl(0");
  });

  test("going down from 0 reaches the last step below 360", () => {
    render(() => <ColorWheel defaultValue="hsl(0, 100%, 50%)" />);

    user.focus(wheel());
    user.key("ArrowLeft");
    flush();

    expect(wheel().value).toBe("359");
  });

  test("Page Up moves by more than an arrow", () => {
    render(() => <ColorWheel defaultValue="hsl(0, 100%, 50%)" />);

    user.focus(wheel());
    user.key("PageUp");
    flush();

    expect(Number(wheel().value)).toBeGreaterThan(1);
  });

  test("a disabled wheel does not turn", () => {
    render(() => <ColorWheel defaultValue="hsl(30, 100%, 50%)" isDisabled />);

    expect(wheel().disabled).toBe(true);
    user.focus(wheel());
    user.key("ArrowRight");
    flush();
    expect(wheel().value).toBe("30");
  });

  test("an RGB value is turned into one that HAS a hue", () => {
    render(() => <ColorWheel defaultValue="#ff0000" />);
    // Red is hue 0 in HSL, and the wheel holds HSL rather than RGB: there is
    // no angle to turn in `#ff0000`.
    expect(wheel().value).toBe("0");
  });

  test("the thumb sits on the ring at the value's angle", () => {
    render(() => <ColorWheel defaultValue="hsl(0, 100%, 50%)" outerRadius={80} innerRadius={64} />);

    const thumb = wheel().parentElement as HTMLElement;
    // Hue 0 is three o'clock: the far right of a ring whose thumb radius is 72,
    // centred at 80.
    expect(Math.round(Number.parseFloat(thumb.style.left))).toBe(152);
    expect(Math.round(Number.parseFloat(thumb.style.top))).toBe(80);
  });

  test("the wheel passes the aria rules", () => {
    render(() => <ColorWheel defaultValue="hsl(120, 100%, 50%)" />);
    expectNoAriaViolations(document.body);
  });
});

describe("a colour area has two inputs and only one can hold focus", () => {
  function inputs(): HTMLInputElement[] {
    return screen.getAllByRole<HTMLInputElement>("slider");
  }

  test("adjusting the Y channel leaves focus on the Y input", () => {
    render(() => (
      <ColorArea defaultValue="hsb(0, 50%, 50%)" xChannel="saturation" yChannel="brightness" />
    ));

    const [x, y] = inputs();
    expect(x).not.toBeUndefined();
    expect(y).not.toBeUndefined();

    user.focus(y as HTMLInputElement);
    user.key("ArrowUp");
    flush();

    // Not the X input. Returning there announces the wrong channel and points
    // the arrows at the wrong axis.
    expect(document.activeElement).toBe(y as HTMLInputElement);
  });

  test("the two inputs describe different channels", () => {
    render(() => (
      <ColorArea defaultValue="hsb(0, 50%, 50%)" xChannel="saturation" yChannel="brightness" />
    ));

    const [x, y] = inputs();
    expect(accessibleName(x as HTMLInputElement)).not.toBe(accessibleName(y as HTMLInputElement));
    expect((x as HTMLInputElement).getAttribute("aria-orientation")).toBe("horizontal");
    expect((y as HTMLInputElement).getAttribute("aria-orientation")).toBe("vertical");
  });
});

describe("a colour slider's keys", () => {
  function Hue(props: { onChange?: (value: Color) => void; onChangeEnd?: (value: Color) => void }) {
    return (
      <ColorSlider
        channel="hue"
        defaultValue="hsb(180, 100%, 100%)"
        onChange={props.onChange}
        onChangeEnd={props.onChangeEnd}
      />
    );
  }

  test("an arrow steps by one and ends the change", () => {
    const changes: Color[] = [];
    const ends: Color[] = [];
    render(() => (
      <Hue onChange={(value) => changes.push(value)} onChangeEnd={(value) => ends.push(value)} />
    ));

    user.focus(screen.getByRole("slider"));
    user.keyDown("ArrowRight");
    flush();
    expect(changes.at(-1)?.getChannelValue("hue")).toBe(181);
    expect(ends.map((value) => value.getChannelValue("hue"))).toEqual([181]);

    user.keyDown("ArrowDown");
    flush();
    expect(ends.map((value) => value.getChannelValue("hue"))).toEqual([181, 180]);
  });

  test("Shift with an arrow moves by the page size", () => {
    const changes: Color[] = [];
    render(() => <Hue onChange={(value) => changes.push(value)} />);

    user.focus(screen.getByRole("slider"));
    user.keyDown("ArrowUp", { shiftKey: true });
    flush();
    expect(changes.at(-1)?.getChannelValue("hue")).toBe(195);
  });

  test("Home and End go to the ends of the channel", () => {
    const ends: Color[] = [];
    render(() => (
      <ColorSlider
        channel="saturation"
        defaultValue="hsb(180, 40%, 100%)"
        onChangeEnd={(value) => ends.push(value)}
      />
    ));

    user.focus(screen.getByRole("slider"));
    user.keyDown("End");
    flush();
    user.keyDown("Home");
    flush();
    expect(ends.map((value) => value.getChannelValue("saturation"))).toEqual([100, 0]);
  });

  test("Page Up ends the change too", () => {
    const ends: Color[] = [];
    render(() => <Hue onChangeEnd={(value) => ends.push(value)} />);

    user.focus(screen.getByRole("slider"));
    user.keyDown("PageUp");
    flush();
    expect(ends.map((value) => value.getChannelValue("hue"))).toEqual([195]);
  });

  test("right to left, right lowers it", () => {
    const changes: Color[] = [];
    function Mirrored() {
      provideDirection("rtl");
      return <Hue onChange={(value) => changes.push(value)} />;
    }
    render(() => <Mirrored />);

    user.focus(screen.getByRole("slider"));
    user.keyDown("ArrowRight");
    flush();
    expect(changes.at(-1)?.getChannelValue("hue")).toBe(179);
  });

  test("right to left, the minimum is on the right", () => {
    function Mirrored() {
      provideDirection("rtl");
      return <ColorSlider channel="saturation" defaultValue="hsb(180, 20%, 100%)" />;
    }
    render(() => <Mirrored />);
    const thumb = screen.getByRole("slider").parentElement as HTMLElement;
    expect(thumb.style.left).toBe("80%");
  });
});

describe("a colour slider names the colour", () => {
  test("a channel other than hue or alpha says what the colour is", () => {
    render(() => <ColorSlider channel="saturation" defaultValue="hsb(0, 100%, 100%)" />);
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe(
      "Saturation 100, vibrant red",
    );
  });

  test("the channel is named in the page's language", () => {
    function German() {
      provideLocale("de-DE");
      return <ColorSlider channel="hue" defaultValue="hsb(0, 100%, 100%)" />;
    }
    render(() => <German />);
    expect(accessibleName(screen.getByRole("slider"))).toBe("Farbton");
  });
});

describe("a colour slider in a form", () => {
  test("name and form reach the input", () => {
    render(() => (
      <ColorSlider channel="hue" defaultValue="hsb(180, 100%, 100%)" name="hue" form="acme" />
    ));
    const input = screen.getByRole<HTMLInputElement>("slider");
    expect(input.name).toBe("hue");
    expect(input.getAttribute("form")).toBe("acme");
    expect(input.value).toBe("180");
  });

  test("a form reset goes back to the starting colour", () => {
    const { container } = render(() => (
      <form>
        <ColorSlider channel="hue" defaultValue="hsb(180, 100%, 100%)" name="hue" />
      </form>
    ));
    const input = screen.getByRole<HTMLInputElement>("slider");
    user.focus(input);
    user.keyDown("PageUp");
    flush();
    expect(input.value).toBe("195");

    (container.querySelector("form") as HTMLFormElement).reset();
    flush();
    expect(input.value).toBe("180");
  });
});

describe("a colour area's keys", () => {
  function Area(props: {
    onChange?: (value: Color) => void;
    onChangeEnd?: (value: Color) => void;
    defaultValue?: string;
  }) {
    return (
      <ColorArea
        defaultValue={props.defaultValue ?? "hsb(180, 50%, 60%)"}
        onChange={props.onChange}
        onChangeEnd={props.onChangeEnd}
      />
    );
  }

  function inputs(): [HTMLInputElement, HTMLInputElement] {
    const [x, y] = screen.getAllByRole<HTMLInputElement>("slider");
    return [x as HTMLInputElement, y as HTMLInputElement];
  }

  test("left and right step the X channel by one and end the change", () => {
    const changes: Color[] = [];
    const ends: Color[] = [];
    render(() => (
      <Area onChange={(value) => changes.push(value)} onChangeEnd={(value) => ends.push(value)} />
    ));

    user.focus(inputs()[0]);
    user.keyDown("ArrowRight");
    flush();
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(51);
    expect(changes.at(-1)?.getChannelValue("brightness")).toBe(60);
    expect(ends).toHaveLength(1);
  });

  test("up and down step the Y channel and hand focus to its input", () => {
    const changes: Color[] = [];
    render(() => <Area onChange={(value) => changes.push(value)} />);

    user.focus(inputs()[0]);
    user.keyDown("ArrowUp");
    flush();
    expect(changes.at(-1)?.getChannelValue("brightness")).toBe(61);
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(50);
    expect(document.activeElement).toBe(inputs()[1]);
  });

  test("Shift with an arrow moves by the page size", () => {
    const changes: Color[] = [];
    render(() => <Area onChange={(value) => changes.push(value)} />);

    user.focus(inputs()[0]);
    user.keyDown("ArrowRight", { shiftKey: true });
    flush();
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(60);
  });

  test("Page Up and Down page Y, Home and End page X", () => {
    const ends: Color[] = [];
    render(() => <Area onChangeEnd={(value) => ends.push(value)} />);

    user.focus(inputs()[0]);
    user.keyDown("PageUp");
    flush();
    user.keyDown("PageDown");
    flush();
    user.keyDown("End");
    flush();
    user.keyDown("Home");
    flush();
    expect(
      ends.map((value) => [
        value.getChannelValue("saturation"),
        value.getChannelValue("brightness"),
      ]),
    ).toEqual([
      [50, 70],
      [50, 60],
      [60, 60],
      [50, 60],
    ]);
  });

  test("right to left, right lowers X and Home raises it", () => {
    const changes: Color[] = [];
    function Mirrored() {
      provideDirection("rtl");
      return <Area onChange={(value) => changes.push(value)} />;
    }
    render(() => <Mirrored />);

    user.focus(inputs()[0]);
    user.keyDown("ArrowRight");
    flush();
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(49);
    user.keyDown("Home");
    flush();
    expect(changes.at(-1)?.getChannelValue("saturation")).toBe(59);
  });

  test("right to left, the X minimum is on the right", () => {
    function Mirrored() {
      provideDirection("rtl");
      return <Area defaultValue="hsb(180, 20%, 60%)" />;
    }
    render(() => <Mirrored />);
    const thumb = inputs()[0].parentElement as HTMLElement;
    expect(thumb.style.left).toBe("80%");
  });
});

describe("a colour area in a form, and named", () => {
  test("each axis submits under its own name", () => {
    render(() => (
      <ColorArea
        defaultValue="hsb(180, 50%, 60%)"
        xName="saturation"
        yName="brightness"
        form="acme"
      />
    ));
    const [x, y] = screen.getAllByRole<HTMLInputElement>("slider");
    expect(x?.name).toBe("saturation");
    expect(y?.name).toBe("brightness");
    expect(x?.getAttribute("form")).toBe("acme");
    expect(y?.getAttribute("form")).toBe("acme");
  });

  test("a form reset goes back to the starting colour", () => {
    const { container } = render(() => (
      <form>
        <ColorArea defaultValue="hsb(180, 50%, 60%)" xName="saturation" yName="brightness" />
      </form>
    ));
    const [x] = screen.getAllByRole<HTMLInputElement>("slider");
    user.focus(x as HTMLInputElement);
    user.keyDown("ArrowRight");
    flush();
    expect(x?.value).toBe("51");

    (container.querySelector("form") as HTMLFormElement).reset();
    flush();
    expect(x?.value).toBe("50");
  });

  test("with no name of its own it is a colour picker, in the page's language", () => {
    function German() {
      provideLocale("de-DE");
      return <ColorArea defaultValue="hsb(180, 50%, 60%)" />;
    }
    render(() => <German />);
    const area = screen.getByRole("application");
    expect(accessibleName(area)).toBe("Farbwähler");
    expect(area.getAttribute("aria-roledescription")).toBe("2D-Schieberegler");
  });

  test("in English it is a colour picker", () => {
    render(() => <ColorArea defaultValue="hsb(180, 50%, 60%)" />);
    expect(accessibleName(screen.getByRole("application"))).toBe("Color picker");
  });
});

describe("a colour thumb", () => {
  test("says when either of the area's inputs holds focus", () => {
    render(() => <ColorArea defaultValue="hsb(180, 50%, 60%)" />);
    const [, y] = screen.getAllByRole<HTMLInputElement>("slider");
    const thumb = (y as HTMLInputElement).parentElement as HTMLElement;
    expect(thumb.hasAttribute("data-focused")).toBe(false);

    user.focus(y as HTMLInputElement);
    flush();
    expect(thumb.hasAttribute("data-focused")).toBe(true);
  });

  test("says when it is disabled", () => {
    render(() => <ColorSlider channel="hue" defaultValue="hsb(180, 100%, 100%)" isDisabled />);
    const thumb = screen.getByRole("slider").parentElement as HTMLElement;
    expect(thumb.hasAttribute("data-disabled")).toBe(true);
  });

  test("says while it is being dragged, and a press on the track ends the change", () => {
    const ends: Color[] = [];
    render(() => (
      <ColorSlider
        channel="hue"
        defaultValue="hsb(180, 100%, 100%)"
        onChangeEnd={(value) => ends.push(value)}
      />
    ));
    const thumb = screen.getByRole("slider").parentElement as HTMLElement;
    const track = thumb.parentElement as HTMLElement;
    track.getBoundingClientRect = () => new DOMRect(0, 0, 360, 10);

    user.pointerDown(track, { clientX: 90, clientY: 5 });
    flush();
    expect(thumb.hasAttribute("data-dragging")).toBe(true);

    user.pointerUp(track, { clientX: 90, clientY: 5 });
    flush();
    expect(thumb.hasAttribute("data-dragging")).toBe(false);
    expect(ends.map((value) => value.getChannelValue("hue"))).toEqual([90]);
  });
});

describe("a colour wheel's ring", () => {
  test("a press on it ends the change when released", () => {
    const ends: Color[] = [];
    render(() => (
      <ColorWheel
        defaultValue="hsl(30, 100%, 50%)"
        outerRadius={80}
        innerRadius={64}
        onChangeEnd={(value) => ends.push(value)}
      />
    ));
    const track = (screen.getByRole("slider").parentElement as HTMLElement)
      .parentElement as HTMLElement;
    track.getBoundingClientRect = () => new DOMRect(0, 0, 160, 160);

    // Straight below the centre, on the ring: 90 degrees.
    user.pointerDown(track, { clientX: 80, clientY: 152 });
    user.pointerUp(track, { clientX: 80, clientY: 152 });
    flush();
    expect(ends.map((value) => Math.round(value.getChannelValue("hue")))).toEqual([90]);
  });
});

describe("a colour wheel's keys", () => {
  test("an arrow ends the change", () => {
    const ends: Color[] = [];
    render(() => (
      <ColorWheel defaultValue="hsl(30, 100%, 50%)" onChangeEnd={(value) => ends.push(value)} />
    ));
    user.focus(screen.getByRole("slider"));
    user.keyDown("ArrowRight");
    flush();
    expect(ends.map((value) => value.getChannelValue("hue"))).toEqual([31]);
  });
});

describe("a colour field's text and keys", () => {
  function field(): HTMLInputElement {
    return screen.getByRole<HTMLInputElement>("textbox");
  }

  function typeInto(text: string): void {
    user.focus(field());
    field().value = text;
    field().dispatchEvent(new Event("input", { bubbles: true }));
  }

  test("hex without a # is still hex", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#000000" onChange={(value) => changes.push(value)} />
    ));
    typeInto("ff0000");
    user.keyDown("Enter");
    flush();
    expect(changes.at(-1)?.toString("hex")).toBe("#ff0000");
    expect(field().value).toBe("#ff0000");
  });

  test("the arrows step the colour by one", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));
    user.focus(field());
    user.keyDown("ArrowUp");
    flush();
    expect(changes.at(-1)?.toString("hex")).toBe("#7f0100");
    expect(field().value).toBe("#7f0100");

    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(field().value).toBe("#7f00fe");

    user.keyDown("PageUp");
    flush();
    expect(field().value).toBe("#7f00ff");
  });

  test("Home and End go to black and white", () => {
    render(() => <ColorField label="Hex" defaultValue="#7f00ff" />);
    user.focus(field());
    user.keyDown("End");
    flush();
    expect(field().value).toBe("#ffffff");
    user.keyDown("Home");
    flush();
    expect(field().value).toBe("#000000");
  });

  test("the arrows step from what was typed, not from what was last committed", () => {
    render(() => <ColorField label="Hex" defaultValue="#7f00ff" />);
    typeInto("#000010");
    user.keyDown("ArrowUp");
    flush();
    expect(field().value).toBe("#000011");
  });

  test("the wheel steps a focused field", () => {
    render(() => <ColorField label="Hex" defaultValue="#000010" />);
    user.focus(field());
    field().dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true, cancelable: true }));
    flush();
    expect(field().value).toBe("#000011");
  });

  test("the wheel leaves an unfocused field alone", () => {
    render(() => <ColorField label="Hex" defaultValue="#000010" />);
    field().dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true, cancelable: true }));
    flush();
    expect(field().value).toBe("#000010");
  });

  test("emptying the field clears the colour", () => {
    const changes: (Color | null)[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));
    typeInto("");
    user.blur(field());
    flush();
    expect(changes).toEqual([null]);
    expect(field().value).toBe("");
  });

  test("a field with no colour starts empty", () => {
    render(() => <ColorField label="Hex" />);
    expect(field().value).toBe("");
  });

  test("emptied inside a picker, it goes back to the picker's colour", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorPicker defaultValue="#7f00ff" onChange={(value) => changes.push(value)}>
        <ColorField label="Hex" />
      </ColorPicker>
    ));
    typeInto("");
    user.blur(field());
    flush();
    expect(changes).toEqual([]);
    expect(field().value).toBe("#7f00ff");
  });
});

describe("a colour swatch's name", () => {
  test("a fully transparent colour is called transparent", () => {
    render(() => <ColorSwatch color="rgba(255, 0, 0, 0)" />);
    expect(accessibleName(screen.getByRole("img"))).toBe("transparent");
  });

  test("it says it is a colour swatch", () => {
    render(() => <ColorSwatch color="#ff0000" />);
    expect(screen.getByRole("img").getAttribute("aria-roledescription")).toBe("color swatch");
  });

  test("in another language it is named for the colour", () => {
    function German() {
      provideLocale("de-DE");
      return <ColorSwatch color="#ff0000" />;
    }
    render(() => <German />);
    const swatch = screen.getByRole("img");
    expect(accessibleName(swatch)).toBe("lebhaftes rot");
    expect(swatch.getAttribute("aria-roledescription")).toBe("Farbfeld");
  });
});

describe("a colour swatch inside a swatch picker item", () => {
  test("a bare swatch shows its item's colour, not the picker's", () => {
    render(() => (
      <ColorPicker defaultValue="#0000ff">
        <ColorSwatchPicker aria-label="Brand colours">
          <ColorSwatchPickerItem color="#ff0000">
            <ColorSwatch data-testid="red" />
          </ColorSwatchPickerItem>
          <ColorSwatchPickerItem color="#00ff00">
            <ColorSwatch data-testid="green" />
          </ColorSwatchPickerItem>
        </ColorSwatchPicker>
      </ColorPicker>
    ));
    const background = (testId: string): string =>
      screen.getByTestId(testId).style.getPropertyValue("background-color");
    expect(background("red")).toBe(parseColor("#ff0000").toString("css"));
    expect(background("green")).toBe(parseColor("#00ff00").toString("css"));
  });

  test("a colour of its own still wins", () => {
    render(() => (
      <ColorSwatchPicker aria-label="Brand colours">
        <ColorSwatchPickerItem color="#ff0000">
          <ColorSwatch data-testid="own" color="#000000" />
        </ColorSwatchPickerItem>
      </ColorSwatchPicker>
    ));
    expect(screen.getByTestId("own").style.getPropertyValue("background-color")).toBe(
      parseColor("#000000").toString("css"),
    );
  });
});
