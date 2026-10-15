import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { provideDirection } from "./i18n.ts";
import { Slider } from "./slider.tsx";

function Volume(
  props: Incoming<{
    defaultValue?: number | number[];
    minValue?: number;
    maxValue?: number;
    step?: number;
    isDisabled?: boolean;
    orientation?: "horizontal" | "vertical";
    formatOptions?: Intl.NumberFormatOptions;
    onChange?: (value: number[]) => void;
    onChangeEnd?: (value: number[]) => void;
    isInverted?: boolean;
    minStepsBetweenThumbs?: number;
  }>,
) {
  return (
    <Slider
      label="Volume"
      defaultValue={props.defaultValue?.() ?? 30}
      minValue={props.minValue?.()}
      maxValue={props.maxValue?.()}
      step={props.step?.()}
      isDisabled={props.isDisabled?.()}
      orientation={props.orientation?.()}
      formatOptions={props.formatOptions?.()}
      onChange={props.onChange?.()}
      onChangeEnd={props.onChangeEnd?.()}
      isInverted={props.isInverted?.()}
      minStepsBetweenThumbs={props.minStepsBetweenThumbs?.()}
    />
  );
}

function thumb(index = 0): HTMLInputElement {
  return screen.getAllByRole("slider")[index] as HTMLInputElement;
}

describe("Slider", () => {
  test("is a group of range inputs named by the label", () => {
    render(() => <Volume />);

    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Volume");
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(thumb().type).toBe("range");
  });

  test("the thumb carries the value and the range it may take", () => {
    render(() => <Volume />);

    expect(thumb().value).toBe("30");
    expect(thumb().min).toBe("0");
    expect(thumb().max).toBe("100");
    expect(thumb().step).toBe("1");
  });

  test("the thumb is announced with the slider's name", () => {
    render(() => <Volume />);
    expect(accessibleName(thumb())).toBe("Volume");
  });

  test("the value is shown as text", () => {
    render(() => <Volume />);
    expect(screen.getByRole("status").textContent).toBe("30");
  });

  test("the value text says what the number means", () => {
    render(() => (
      <Volume formatOptions={{ style: "percent" }} defaultValue={0.3} maxValue={1} step={0.01} />
    ));

    expect(screen.getByRole("status").textContent).toBe("30%");
    expect(thumb().getAttribute("aria-valuetext")).toBe("30%");
  });

  test("typing into the input moves the thumb", () => {
    const changes: number[][] = [];
    render(() => <Volume onChange={(value) => changes.push(value)} />);

    const input = thumb();
    input.value = "55";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes).toEqual([[55]]);
    expect(input.value).toBe("55");
  });

  test("a value off the step snaps to it", () => {
    const changes: number[][] = [];
    render(() => <Volume step={10} onChange={(value) => changes.push(value)} />);

    const input = thumb();
    input.value = "37";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes).toEqual([[40]]);
  });

  test("Home and End go to the ends", () => {
    render(() => <Volume />);

    user.focus(thumb());
    user.keyDown("End");
    flush();
    expect(thumb().value).toBe("100");

    user.keyDown("Home");
    flush();
    expect(thumb().value).toBe("0");
  });

  test("Page Up and Page Down move a tenth of the range", () => {
    render(() => <Volume />);

    user.focus(thumb());
    user.keyDown("PageUp");
    flush();
    expect(thumb().value).toBe("40");

    user.keyDown("PageDown");
    flush();
    expect(thumb().value).toBe("30");
  });

  test("a keyboard change reports the end of the gesture", () => {
    const ends: number[][] = [];
    render(() => <Volume onChangeEnd={(value) => ends.push(value)} />);

    user.focus(thumb());
    user.keyDown("End");
    flush();

    expect(ends).toEqual([[100]]);
  });

  test("a range has one input per thumb, penned in by its neighbours", () => {
    render(() => <Volume defaultValue={[20, 60]} />);

    const thumbs = screen.getAllByRole("slider");
    expect(thumbs).toHaveLength(2);

    // The lower thumb cannot pass the upper one, and the upper cannot pass the
    // lower: the same gesture must not produce a different value depending on
    // which way the pointer went.
    expect((thumbs[0] as HTMLInputElement).max).toBe("60");
    expect((thumbs[1] as HTMLInputElement).min).toBe("20");
  });

  test("a range shows both values together", () => {
    render(() => <Volume defaultValue={[20, 60]} />);
    expect(screen.getByRole("status").textContent).toBe("20–60");
  });

  test("a vertical slider says so", () => {
    render(() => <Volume orientation="vertical" />);
    expect(thumb().getAttribute("aria-orientation")).toBe("vertical");
  });

  test("a disabled slider cannot be moved", () => {
    const changes: number[][] = [];
    render(() => <Volume isDisabled onChange={(value) => changes.push(value)} />);

    expect(thumb().disabled).toBe(true);

    user.focus(thumb());
    user.keyDown("End");
    flush();

    expect(changes).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Volume defaultValue={[20, 60]} />);
    expectNoAriaViolations(container);
  });
});

describe("Slider, by the arrow keys", () => {
  test("right and up raise the value, left and down lower it", () => {
    render(() => <Volume />);
    user.focus(thumb());
    user.keyDown("ArrowRight");
    flush();
    expect(thumb().value).toBe("31");
    user.keyDown("ArrowUp");
    flush();
    expect(thumb().value).toBe("32");
    user.keyDown("ArrowLeft");
    user.keyDown("ArrowDown");
    flush();
    expect(thumb().value).toBe("30");
  });

  test("right to left, the minimum is on the right, so right lowers it", () => {
    function Mirrored() {
      provideDirection("rtl");
      return <Volume />;
    }
    render(() => <Mirrored />);
    user.focus(thumb());
    user.keyDown("ArrowRight");
    flush();
    expect(thumb().value).toBe("29");
    user.keyDown("ArrowLeft");
    user.keyDown("ArrowLeft");
    flush();
    expect(thumb().value).toBe("31");
  });

  test("inverted puts the minimum at the far end, and the keys follow what is drawn", () => {
    render(() => <Volume isInverted />);
    expect(screen.getByRole("group").getAttribute("data-inverted")).toBe("");
    user.focus(thumb());
    user.keyDown("ArrowRight");
    flush();
    expect(thumb().value).toBe("29");
    user.keyDown("ArrowLeft");
    user.keyDown("ArrowLeft");
    flush();
    expect(thumb().value).toBe("31");
    // Up and down are not mirrored by a horizontal inversion.
    user.keyDown("ArrowUp");
    flush();
    expect(thumb().value).toBe("32");
  });

  test("inverted and right to left cancel out", () => {
    function Mirrored() {
      provideDirection("rtl");
      return <Volume isInverted />;
    }
    render(() => <Mirrored />);
    user.focus(thumb());
    user.keyDown("ArrowRight");
    flush();
    expect(thumb().value).toBe("31");
  });

  test("an inverted vertical slider has its minimum at the top, so up lowers it", () => {
    render(() => <Volume orientation="vertical" isInverted />);
    user.focus(thumb());
    user.keyDown("ArrowUp");
    flush();
    expect(thumb().value).toBe("29");
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(thumb().value).toBe("31");
  });

  test("an arrow key reports the end of its gesture", () => {
    const ends: number[][] = [];
    render(() => <Volume onChangeEnd={(value) => ends.push(value)} />);
    user.focus(thumb());
    user.keyDown("ArrowRight");
    flush();
    expect(ends).toEqual([[31]]);
  });
});

describe("Slider, with thumbs kept apart", () => {
  test("each thumb's range stops short of its neighbour", () => {
    render(() => <Volume defaultValue={[20, 60]} step={5} minStepsBetweenThumbs={2} />);
    expect(thumb(0).max).toBe("50");
    expect(thumb(1).min).toBe("30");
  });

  test("a thumb pushed at its neighbour stops the gap away", () => {
    const changes: number[][] = [];
    render(() => (
      <Volume
        defaultValue={[20, 60]}
        step={5}
        minStepsBetweenThumbs={2}
        onChange={(value) => changes.push(value)}
      />
    ));
    user.focus(thumb(0));
    user.keyDown("End");
    flush();
    expect(changes.at(-1)).toEqual([50, 60]);
  });

  test("values that start too close are opened out", () => {
    render(() => <Volume defaultValue={[40, 42]} step={1} minStepsBetweenThumbs={5} />);
    expect(Number(thumb(1).value) - Number(thumb(0).value)).toBeGreaterThanOrEqual(5);
  });
});

describe("Slider, by the pointer", () => {
  function press(track: Element, clientX: number): void {
    track.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }

  function trackOf(group: HTMLElement): HTMLElement {
    const track = thumb().parentElement?.parentElement as HTMLElement;
    expect(group.contains(track)).toBe(true);
    track.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 10, right: 200, bottom: 10 }) as DOMRect;
    return track;
  }

  test("a press a quarter of the way along sets a quarter", () => {
    render(() => <Volume />);
    press(trackOf(screen.getByRole("group")), 50);
    flush();
    expect(thumb().value).toBe("25");
  });

  test("inverted, the same press sets three quarters", () => {
    render(() => <Volume isInverted />);
    press(trackOf(screen.getByRole("group")), 50);
    flush();
    expect(thumb().value).toBe("75");
  });

  test("right to left, the same press sets three quarters", () => {
    function Mirrored() {
      provideDirection("rtl");
      return <Volume />;
    }
    render(() => <Mirrored />);
    press(trackOf(screen.getByRole("group")), 50);
    flush();
    expect(thumb().value).toBe("75");
  });
});
