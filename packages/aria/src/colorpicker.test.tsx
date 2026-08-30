import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { parseColor, type Color } from "./color.ts";
import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorWheel,
} from "./colorpicker.tsx";

describe("ColorSlider", () => {
  function Hue(props: Incoming<{ onChange?: (value: Color) => void }>) {
    return (
      <ColorSlider
        channel="hue"
        defaultValue="hsb(180, 100%, 100%)"
        onChange={props.onChange?.()}
      />
    );
  }

  test("is a range input named for its channel", () => {
    render(() => <Hue />);

    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(accessibleName(input)).toBe("Hue");
  });

  test("the channel's own range is what it moves in", () => {
    render(() => <Hue />);

    const input = screen.getByRole("slider") as HTMLInputElement;
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

    const input = screen.getByRole("slider") as HTMLInputElement;
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

    const input = screen.getByRole("slider") as HTMLInputElement;
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

    const input = screen.getByRole("slider") as HTMLInputElement;
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

    const [x, y] = screen.getAllByRole("slider") as HTMLInputElement[];
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

describe("ColorField", () => {
  test("shows the colour as text", () => {
    render(() => <ColorField label="Hex" defaultValue="#7f00ff" />);
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("#7f00ff");
  });

  test("commits on blur, not as you type", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));

    const input = screen.getByRole("textbox") as HTMLInputElement;
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
    const changes: Color[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    user.focus(input);
    input.value = "#0000ff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    user.keyDown("Enter");
    flush();

    expect(changes.at(-1)?.toString("hex")).toBe("#0000ff");
  });

  test("text that is not a colour goes back to what the field holds", () => {
    const changes: Color[] = [];
    render(() => (
      <ColorField label="Hex" defaultValue="#7f00ff" onChange={(value) => changes.push(value)} />
    ));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    user.focus(input);
    input.value = "not a colour";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    user.blur(input);
    flush();

    expect(input.value).toBe("#7f00ff");
    expect(changes).toEqual([]);
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

    const hue = screen.getByRole("slider", { name: "Hue" }) as HTMLInputElement;
    expect(hue.value).toBe("180");

    hue.value = "300";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes.at(-1)?.getChannelValue("hue")).toBe(300);
    // The area followed: it is the same colour.
    const area = screen.getByRole("slider", { name: "Saturation" }) as HTMLInputElement;
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
    return screen.getByRole("slider") as HTMLInputElement;
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
