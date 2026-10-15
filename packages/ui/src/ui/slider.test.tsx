import { afterEach, describe, expect, test } from "bun:test";
import { provideDirection } from "@barqjs/aria/i18n";
import { flush, type Child, type Incoming } from "@barqjs/core";
import { cleanup, render, screen, user } from "@barqjs/testing";

import { Label } from "./label.tsx";
import { Slider } from "./slider.tsx";

afterEach(cleanup);

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
const thumbs = (): HTMLInputElement[] => screen.getAllByRole("slider") as HTMLInputElement[];
const custom = (element: HTMLElement, name: string): string => element.style.getPropertyValue(name);

function Mirrored(props: Incoming<{ children?: Child }>) {
  provideDirection("rtl");
  return <div>{props.children}</div>;
}

describe("Slider, by shadcn's names", () => {
  test("min and max bound it", () => {
    render(() => <Slider aria-label="Year" min={1990} max={2030} defaultValue={2000} />);
    expect(thumbs()[0]?.min).toBe("1990");
    expect(thumbs()[0]?.max).toBe("2030");
    expect(custom(slot("slider-thumb"), "--barq-slider-thumb")).toBe("25%");
  });

  test("onValueChange hears every change and onValueCommit the end of the gesture", () => {
    const changes: number[][] = [];
    const commits: number[][] = [];
    render(() => (
      <Slider
        aria-label="Volume"
        defaultValue={30}
        onValueChange={(value) => changes.push(value)}
        onValueCommit={(value) => commits.push(value)}
      />
    ));
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    user.keyDown("End");
    flush();
    expect(changes).toEqual([[31], [100]]);
    expect(commits).toEqual([[31], [100]]);
  });

  test("disabled reaches every thumb and marks the root", () => {
    render(() => <Slider aria-label="Volume" defaultValue={[20, 60]} disabled />);
    expect(thumbs().every((thumb) => thumb.disabled)).toBe(true);
    expect(slot("slider").getAttribute("data-disabled")).toBe("");
  });

  test("minStepsBetweenThumbs keeps two thumbs apart", () => {
    render(() => (
      <Slider aria-label="Price" defaultValue={[20, 60]} step={5} minStepsBetweenThumbs={2} />
    ));
    expect(thumbs()[0]?.max).toBe("50");
    expect(thumbs()[1]?.min).toBe("30");
  });

  test("every part says which way the slider runs", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} orientation="vertical" />);
    for (const name of ["slider", "slider-track", "slider-thumb"]) {
      expect(slot(name).getAttribute("data-orientation"), name).toBe("vertical");
    }
  });
});

describe("Slider, drawn from the other end", () => {
  test("left to right, the fill starts at the left edge", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    expect(custom(slot("slider-track"), "--barq-slider-start")).toBe("0%");
    expect(custom(slot("slider-track"), "--barq-slider-end")).toBe("30%");
    expect(custom(slot("slider-thumb"), "--barq-slider-thumb")).toBe("30%");
  });

  test("right to left, the minimum is at the right, so the fill and thumb are mirrored", () => {
    render(() => (
      <Mirrored>
        <Slider aria-label="Volume" defaultValue={30} />
      </Mirrored>
    ));
    expect(custom(slot("slider-track"), "--barq-slider-start")).toBe("70%");
    expect(custom(slot("slider-track"), "--barq-slider-end")).toBe("100%");
    expect(custom(slot("slider-thumb"), "--barq-slider-thumb")).toBe("70%");
  });

  test("dir on the slider itself mirrors it, the keys included", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} dir="rtl" />);
    expect(slot("slider").getAttribute("dir")).toBe("rtl");
    expect(custom(slot("slider-thumb"), "--barq-slider-thumb")).toBe("70%");
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(thumbs()[0]?.value).toBe("29");
  });

  test("inverted mirrors it without a direction, the keys included", () => {
    render(() => <Slider aria-label="Volume" defaultValue={[20, 60]} inverted />);
    expect(slot("slider").getAttribute("data-inverted")).toBe("");
    expect(custom(slot("slider-track"), "--barq-slider-start")).toBe("40%");
    expect(custom(slot("slider-track"), "--barq-slider-end")).toBe("80%");
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(thumbs()[0]?.value).toBe("21");
  });

  test("inverted and right to left cancel out", () => {
    render(() => (
      <Mirrored>
        <Slider aria-label="Volume" defaultValue={30} inverted />
      </Mirrored>
    ));
    expect(custom(slot("slider-thumb"), "--barq-slider-thumb")).toBe("30%");
  });

  test("an inverted vertical slider fills from the top", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} orientation="vertical" inverted />);
    expect(custom(slot("slider-track"), "--barq-slider-start")).toBe("70%");
    expect(custom(slot("slider-track"), "--barq-slider-end")).toBe("100%");
    expect(custom(slot("slider-thumb"), "--barq-slider-thumb")).toBe("70%");
  });
});

describe("Slider, named by a label elsewhere", () => {
  test("its id is the first thumb's, so the label names that thumb and is what pressing it reaches", async () => {
    const { container } = render(() => (
      <div>
        <Label for="volume">Volume</Label>
        <Slider id="volume" defaultValue={[40]} />
      </div>
    ));
    const thumb = screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;
    expect(thumb.id).toBe("volume");
    expect(container.querySelectorAll("#volume")).toHaveLength(1);

    const group = screen.getByRole("group");
    expect(group.id).not.toBe("volume");
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
    expect(screen.getByRole("group", { name: "Volume" })).toBe(group);

    // What the platform focuses and clicks when the label is pressed.
    expect(label.control).toBe(thumb);
    await user.tab();
    expect(document.activeElement).toBe(thumb);
    await user.keyboard("{ArrowRight}");
    flush();
    expect(thumb.value).toBe("41");
  });

  test("a range keeps the id on its first thumb, which the label names", () => {
    render(() => (
      <div>
        <Label for="price">Price</Label>
        <Slider id="price" defaultValue={[20, 60]} />
      </div>
    ));
    expect(thumbs().map((each) => each.id)[0]).toBe("price");
    expect(new Set(thumbs().map((each) => each.id)).size).toBe(2);
    expect(screen.getByRole("slider", { name: "Price" })).toBe(thumbs()[0] as HTMLElement);
  });

  test("named by aria-label, the group still names the thumbs", () => {
    render(() => (
      <Slider id="year" aria-label="Year" defaultValue={[2000]} min={1990} max={2030} />
    ));
    const thumb = screen.getByRole("slider", { name: "Year" }) as HTMLInputElement;
    expect(thumb.id).toBe("year");
  });
});
