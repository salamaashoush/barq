import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { DirectionProvider } from "./direction.tsx";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group.tsx";

function Alignment(props: {
  type?: "single" | "multiple";
  orientation?: "horizontal" | "vertical";
  dir?: "ltr" | "rtl";
  disabled?: boolean;
  loop?: boolean;
  rovingFocus?: boolean;
  defaultValue?: string | readonly string[];
  onValueChange?: (value: string | string[]) => void;
}) {
  return (
    <ToggleGroup
      type={props.type}
      orientation={props.orientation}
      dir={props.dir}
      disabled={props.disabled}
      loop={props.loop}
      rovingFocus={props.rovingFocus}
      defaultValue={props.defaultValue}
      onValueChange={props.onValueChange}
      aria-label="Alignment"
    >
      <ToggleGroupItem value="left" aria-label="Left">
        L
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Center">
        C
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Right">
        R
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

const item = (name: string): HTMLElement => screen.getByRole("button", { name });
const group = (): HTMLElement => screen.getByRole("group");
const tabStops = (): string[] =>
  screen
    .getAllByRole("button")
    .filter((each) => each.getAttribute("tabindex") === "0")
    .map((each) => each.getAttribute("aria-label") ?? "");

describe("ToggleGroup roving focus", () => {
  test("Tab enters the group once, at the first item when nothing is pressed", () => {
    render(() => <Alignment />);
    expect(tabStops()).toEqual(["Left"]);
    expect(item("Center").getAttribute("tabindex")).toBe("-1");

    user.tab();
    expect(document.activeElement).toBe(item("Left"));
  });

  test("the pressed item is the tab stop, so Tab returns to what is chosen", () => {
    render(() => <Alignment defaultValue="center" />);
    expect(tabStops()).toEqual(["Center"]);
  });

  test("the arrows move focus between items without pressing them", () => {
    render(() => <Alignment />);
    user.focus(item("Left"));

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Center"));
    expect(item("Center").getAttribute("aria-pressed")).toBe("false");

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(item("Left"));
  });

  test("the tab stop follows focus, so leaving and returning lands on the same item", () => {
    render(() => <Alignment />);
    user.focus(item("Left"));
    user.keyDown("ArrowRight");
    flush();
    expect(tabStops()).toEqual(["Center"]);
  });

  test("focus wraps at the ends", () => {
    render(() => <Alignment />);
    user.focus(item("Right"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Left"));

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(item("Right"));
  });

  test("loop false stops at the ends", () => {
    render(() => <Alignment loop={false} />);
    user.focus(item("Right"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Right"));
  });

  test("Home and End go to the first and last items", () => {
    render(() => <Alignment />);
    user.focus(item("Center"));
    user.keyDown("End");
    flush();
    expect(document.activeElement).toBe(item("Right"));

    user.keyDown("Home");
    flush();
    expect(document.activeElement).toBe(item("Left"));
  });

  test("with no orientation named, the vertical arrows move too", () => {
    render(() => <Alignment />);
    user.focus(item("Left"));
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(item("Center"));
    user.keyDown("ArrowUp");
    flush();
    expect(document.activeElement).toBe(item("Left"));
  });

  test("a horizontal group leaves the vertical arrows to the page", () => {
    render(() => <Alignment orientation="horizontal" />);
    user.focus(item("Left"));
    const proceed = user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(item("Left"));
    expect(proceed).toBe(true);
  });

  test("a vertical group takes the vertical arrows and not the horizontal ones", () => {
    render(() => <Alignment orientation="vertical" />);
    expect(group().getAttribute("data-orientation")).toBe("vertical");
    user.focus(item("Left"));

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Left"));

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(item("Center"));
  });

  test("right to left flips the horizontal arrows", () => {
    render(() => <Alignment dir="rtl" />);
    expect(group().getAttribute("dir")).toBe("rtl");
    user.focus(item("Left"));

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(item("Center"));

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Left"));
  });

  test("the direction declared around it is read too", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <Alignment />
      </DirectionProvider>
    ));
    user.focus(item("Left"));
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(item("Center"));
  });

  test("right to left leaves a vertical group's arrows alone", () => {
    render(() => <Alignment dir="rtl" orientation="vertical" />);
    user.focus(item("Left"));
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(item("Center"));
  });

  test("a disabled item is skipped by the arrows and is never the tab stop", () => {
    render(() => (
      <ToggleGroup aria-label="Alignment">
        <ToggleGroupItem value="left" aria-label="Left" disabled>
          L
        </ToggleGroupItem>
        <ToggleGroupItem value="center" aria-label="Center">
          C
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Right" isDisabled>
          R
        </ToggleGroupItem>
        <ToggleGroupItem value="justify" aria-label="Justify">
          J
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    expect(tabStops()).toEqual(["Center"]);
    expect(item("Left").hasAttribute("disabled")).toBe(true);
    expect(item("Right").hasAttribute("disabled")).toBe(true);

    user.focus(item("Center"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Justify"));
  });

  test("rovingFocus false leaves every item in the tab order and the arrows alone", () => {
    render(() => <Alignment rovingFocus={false} />);
    expect(tabStops()).toEqual(["Left", "Center", "Right"]);
    user.focus(item("Left"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Left"));
  });

  test("an item added later joins the order where it sits in the document", () => {
    const [extra, setExtra] = createSignal(false);
    render(() => (
      <ToggleGroup aria-label="Alignment">
        {extra() ? (
          <ToggleGroupItem value="start" aria-label="Start">
            S
          </ToggleGroupItem>
        ) : null}
        <ToggleGroupItem value="left" aria-label="Left">
          L
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Right">
          R
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    expect(tabStops()).toEqual(["Left"]);

    setExtra(true);
    flush();
    expect(tabStops()).toEqual(["Start"]);

    user.focus(item("Start"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(item("Left"));
  });
});

describe("ToggleGroup value", () => {
  test("Space and Enter press the focused item", () => {
    render(() => <Alignment />);
    user.focus(item("Left"));
    user.keyDown("ArrowRight");
    flush();
    user.key(" ");
    flush();
    expect(item("Center").getAttribute("aria-pressed")).toBe("true");

    user.key("Enter");
    flush();
    expect(item("Center").getAttribute("aria-pressed")).toBe("false");
  });

  test("single reports a string, and an empty one when the press is undone", async () => {
    const seen: (string | string[])[] = [];
    render(() => <Alignment onValueChange={(value) => seen.push(value)} />);
    await user.click(item("Center"));
    await user.click(item("Right"));
    await user.click(item("Right"));
    expect(seen).toEqual(["center", "right", ""]);
  });

  test("multiple reports the list", async () => {
    const seen: (string | string[])[] = [];
    render(() => <Alignment type="multiple" onValueChange={(value) => seen.push(value)} />);
    await user.click(item("Left"));
    await user.click(item("Right"));
    expect(seen).toEqual([["left"], ["left", "right"]]);
  });

  test("a single group takes its default as a plain string", () => {
    render(() => <Alignment defaultValue="right" />);
    expect(item("Right").getAttribute("aria-pressed")).toBe("true");
    expect(item("Left").getAttribute("aria-pressed")).toBe("false");
  });

  test("a controlled group shows what it is given, not what was pressed", async () => {
    const [value, setValue] = createSignal("left");
    const seen: (string | string[])[] = [];
    render(() => (
      <ToggleGroup value={value()} onValueChange={(next) => seen.push(next)} aria-label="Alignment">
        <ToggleGroupItem value="left" aria-label="Left">
          L
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Right">
          R
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    await user.click(item("Right"));
    flush();
    expect(seen).toEqual(["right"]);
    expect(item("Left").getAttribute("aria-pressed")).toBe("true");
    expect(item("Right").getAttribute("aria-pressed")).toBe("false");

    setValue("right");
    flush();
    expect(item("Right").getAttribute("aria-pressed")).toBe("true");
  });

  test("a disabled group disables every item and reports nothing", async () => {
    const seen: (string | string[])[] = [];
    render(() => <Alignment disabled onValueChange={(value) => seen.push(value)} />);
    expect(group().hasAttribute("data-disabled")).toBe(true);
    for (const each of screen.getAllByRole("button")) {
      expect(each.hasAttribute("disabled")).toBe(true);
      expect(each.hasAttribute("data-disabled")).toBe(true);
    }
    await user.click(item("Left"));
    expect(seen).toEqual([]);
    expect(tabStops()).toEqual([]);
  });
});

describe("ToggleGroup attributes", () => {
  test("each item carries the state attributes a style selects on", async () => {
    render(() => <Alignment orientation="vertical" />);
    const center = item("Center");
    expect(center.getAttribute("data-slot")).toBe("toggle-group-item");
    expect(center.getAttribute("data-state")).toBe("off");
    expect(center.getAttribute("data-orientation")).toBe("vertical");
    await user.click(center);
    flush();
    expect(center.getAttribute("data-state")).toBe("on");
    expect(center.hasAttribute("data-selected")).toBe(true);
  });

  test("the group names itself and carries its orientation", () => {
    render(() => <Alignment />);
    expect(group().getAttribute("aria-label")).toBe("Alignment");
    expect(group().getAttribute("data-slot")).toBe("toggle-group");
    expect(group().getAttribute("data-orientation")).toBe("horizontal");
  });

  test("an item falls back to its own variant and size when the group names none", () => {
    render(() => (
      <ToggleGroup aria-label="Alignment">
        <ToggleGroupItem value="left" aria-label="Left" variant="outline" size="lg">
          L
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    expect(item("Left").getAttribute("data-variant")).toBe("outline");
    expect(item("Left").getAttribute("data-size")).toBe("lg");
  });

  test("the group's variant wins over the item's", () => {
    render(() => (
      <ToggleGroup aria-label="Alignment" variant="outline" size="sm">
        <ToggleGroupItem value="left" aria-label="Left" variant="default" size="lg">
          L
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    expect(item("Left").getAttribute("data-variant")).toBe("outline");
    expect(item("Left").getAttribute("data-size")).toBe("sm");
  });

  test("the welded edges are logical, so a right-to-left row rounds the right end first", () => {
    render(() => (
      <ToggleGroup aria-label="Alignment" variant="outline">
        <ToggleGroupItem value="left" aria-label="Left">
          L
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    const rules = rulesFor(item("Left").className);
    expect(rules).toContain('[data-spacing="0"]:first-child{border-start-start-radius');
    expect(rules).toContain('[data-spacing="0"]:first-child{border-end-start-radius');
    expect(rules).toContain('[data-spacing="0"]:last-child{border-start-end-radius');
    expect(rules).toContain(
      '[data-spacing="0"][data-variant="outline"]{border-inline-start-width: 0px',
    );
    expect(rules).not.toContain('[data-variant="outline"]{border-left-width');
    expect(rules).not.toContain("padding-left");
    expect(rules).not.toContain("padding-right");
  });

  test("an item's own handlers and attributes reach the button", async () => {
    const seen: string[] = [];
    render(() => (
      <ToggleGroup aria-label="Alignment">
        <ToggleGroupItem
          value="left"
          aria-label="Left"
          id="align-left"
          onPress={() => seen.push("press")}
          onChange={(on) => seen.push(`change:${String(on)}`)}
        >
          L
        </ToggleGroupItem>
      </ToggleGroup>
    ));
    await user.click(item("Left"));
    expect(item("Left").id).toBe("align-left");
    expect(seen.toSorted()).toEqual(["change:true", "press"]);
  });
});
