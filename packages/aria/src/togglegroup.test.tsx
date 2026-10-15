import { describe, expect, test } from "bun:test";
import { createRoot, createSignal, flush, type Incoming } from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { accessibleName, render, screen, user } from "@barqjs/testing";
import { Button, ToggleButton } from "./button.tsx";
import { provideDirection } from "./i18n.ts";
import { Toolbar } from "./toolbar.tsx";
import {
  toggleGroup,
  toggleGroupItem,
  toggleGroupState,
  type ToggleGroupState,
  type ToggleGroupStateOptions,
} from "./togglegroup.ts";

/** Under a root, as a component would make one: the state owns an effect. */
function rooted(options: ToggleGroupStateOptions = {}): ToggleGroupState {
  return createRoot(() => toggleGroupState(options));
}

describe("toggleGroupState", () => {
  test("single keeps one, and pressing it again releases it", () => {
    const seen: string[][] = [];
    const state = rooted({ onSelectionChange: (keys) => seen.push(keys) });
    state.toggle("a");
    flush();
    state.toggle("b");
    flush();
    expect(state.selectedKeys()).toEqual(["b"]);
    state.toggle("b");
    flush();
    expect(state.selectedKeys()).toEqual([]);
    expect(seen).toEqual([["a"], ["b"], []]);
  });

  test("multiple keeps every one pressed, in the order they were pressed", () => {
    const state = rooted({ selectionMode: "multiple", defaultSelectedKeys: ["b"] });
    state.toggle("a");
    flush();
    expect(state.selectedKeys()).toEqual(["b", "a"]);
    expect(state.isSelected("a")).toBe(true);
    state.setSelected("b", false);
    flush();
    expect(state.selectedKeys()).toEqual(["a"]);
  });

  test("setting what is already so reports nothing", () => {
    const seen: string[][] = [];
    const state = rooted({
      defaultSelectedKeys: ["a"],
      onSelectionChange: (keys) => seen.push(keys),
    });
    state.setSelected("a", true);
    state.setSelected("b", false);
    flush();
    expect(seen).toEqual([]);
  });

  test("controlled, it reports the press and keeps what it was given", () => {
    const seen: string[][] = [];
    const [keys, setKeys] = createSignal<readonly string[]>(["a"]);
    const state = rooted({
      selectedKeys: keys,
      onSelectionChange: (next) => seen.push(next),
    });
    state.toggle("b");
    flush();
    expect(seen).toEqual([["b"]]);
    expect(state.selectedKeys()).toEqual(["a"]);
    setKeys(["b"]);
    flush();
    expect(state.selectedKeys()).toEqual(["b"]);
  });

  test("disabled, nothing can be pressed and nothing is a tab stop", () => {
    const state = rooted({ isDisabled: true });
    const remove = state.register("a", { element: () => null, isDisabled: () => false });
    state.toggle("a");
    flush();
    expect(state.selectedKeys()).toEqual([]);
    expect(state.tabStop()).toBeNull();
    remove();
  });

  test("the tab stop is the focused item, then the pressed one, then the first usable", () => {
    const state = rooted({ selectionMode: "multiple" });
    const off = [
      state.register("a", { element: () => null, isDisabled: () => true }),
      state.register("b", { element: () => null, isDisabled: () => false }),
      state.register("c", { element: () => null, isDisabled: () => false }),
    ];
    flush();
    expect(state.tabStop()).toBe("b");

    state.toggle("c");
    flush();
    expect(state.tabStop()).toBe("c");

    state.setFocusedKey("b");
    flush();
    expect(state.tabStop()).toBe("b");

    // A stop that cannot take focus is no stop at all.
    state.setFocusedKey("a");
    flush();
    expect(state.tabStop()).toBe("c");
    for (const each of off) each();
  });

  test("an item that leaves gives the stop back", () => {
    const state = rooted();
    const removeA = state.register("a", { element: () => null, isDisabled: () => false });
    const removeB = state.register("b", { element: () => null, isDisabled: () => false });
    state.setFocusedKey("a");
    flush();
    removeA();
    flush();
    expect(state.tabStop()).toBe("b");
    removeB();
    flush();
    expect(state.tabStop()).toBeNull();
  });
});

function Item(props: Incoming<{ state: ToggleGroupState; value: string; isDisabled?: boolean }>) {
  const domRef = makeRef<HTMLButtonElement>();
  const item = toggleGroupItem(
    { value: () => props.value(), isDisabled: () => props.isDisabled?.(), ref: domRef },
    props.state(),
  );
  return (
    <ToggleButton
      ref={(element: unknown) => {
        domRef.set(element instanceof HTMLButtonElement ? element : null);
      }}
      isSelected={item.isSelected()}
      isDisabled={item.isDisabled()}
      excludeFromTabOrder={item.excludeFromTabOrder()}
      onChange={(next) => item.onChange(next)}
    >
      {props.value()}
    </ToggleButton>
  );
}

interface GroupProps {
  selectionMode?: "single" | "multiple";
  rovingFocus?: boolean;
  orientation?: "horizontal" | "vertical";
  direction?: "ltr" | "rtl";
  scoped?: "ltr" | "rtl";
}

function Group(props: Incoming<GroupProps>) {
  if (props.scoped?.() !== undefined) provideDirection(() => props.scoped?.() ?? "ltr");
  return <Inner {...props} />;
}

function Inner(props: Incoming<GroupProps>) {
  const state = toggleGroupState({
    selectionMode: () => props.selectionMode?.(),
    rovingFocus: () => props.rovingFocus?.(),
  });
  const groupRef = makeRef<HTMLDivElement>();
  const { groupProps } = toggleGroup(
    {
      ref: groupRef,
      orientation: () => props.orientation?.(),
      direction: () => props.direction?.(),
      "aria-label": "Formatting",
    },
    state,
  );
  return (
    <div {...groupProps} ref={groupRef.set}>
      <Item state={state} value="Bold" />
      <Item state={state} value="Italic" />
      <Item state={state} value="Strike" isDisabled />
      <Item state={state} value="Underline" />
    </div>
  );
}

const named = (name: string): HTMLElement => screen.getByRole("button", { name });

describe("toggleGroup", () => {
  test("is a named group of pressable buttons with one tab stop", () => {
    render(() => <Group />);
    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Formatting");
    expect(named("Bold").getAttribute("aria-pressed")).toBe("false");
    expect(named("Bold").getAttribute("tabindex")).toBe("0");
    expect(named("Italic").getAttribute("tabindex")).toBe("-1");

    expect(named("Strike").hasAttribute("tabindex")).toBe(false);
    expect(named("Underline").getAttribute("tabindex")).toBe("-1");

    user.tab();
    expect(document.activeElement).toBe(named("Bold"));
  });

  test("arrows walk the usable items in document order and wrap", () => {
    render(() => <Group />);
    user.focus(named("Italic"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Underline"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Bold"));
    user.keyDown("End");
    flush();
    expect(document.activeElement).toBe(named("Underline"));
    user.keyDown("Home");
    flush();
    expect(document.activeElement).toBe(named("Bold"));
  });

  test("a handled key is taken, and one with a modifier is left to the browser", () => {
    render(() => <Group />);
    user.focus(named("Bold"));
    expect(user.keyDown("ArrowRight")).toBe(false);
    flush();
    expect(user.keyDown("ArrowLeft", { altKey: true })).toBe(true);
    flush();
    expect(document.activeElement).toBe(named("Italic"));
  });

  test("the direction in scope flips left and right, and an explicit one wins over it", () => {
    render(() => <Group scoped="rtl" />);
    user.focus(named("Bold"));
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(named("Italic"));
  });

  test("an explicit direction is written as dir and wins over the scope", () => {
    render(() => <Group scoped="rtl" direction="ltr" />);
    expect(screen.getByRole("group").getAttribute("dir")).toBe("ltr");
    user.focus(named("Bold"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Italic"));
  });

  test("a vertical group takes only the vertical arrows", () => {
    render(() => <Group orientation="vertical" />);
    user.focus(named("Bold"));
    expect(user.keyDown("ArrowRight")).toBe(true);
    flush();
    expect(document.activeElement).toBe(named("Bold"));
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(named("Italic"));
  });

  test("pressing an item presses it in the group", () => {
    render(() => <Group selectionMode="multiple" />);
    user.click(named("Bold"));
    user.click(named("Italic"));
    flush();
    expect(named("Bold").getAttribute("aria-pressed")).toBe("true");
    expect(named("Italic").getAttribute("aria-pressed")).toBe("true");
  });

  test("without roving every usable item is a stop and the arrows are not taken", () => {
    render(() => <Group rovingFocus={false} />);
    expect(named("Italic").getAttribute("tabindex")).toBe("0");
    user.focus(named("Bold"));
    expect(user.keyDown("ArrowRight")).toBe(true);
    flush();
    expect(document.activeElement).toBe(named("Bold"));
  });

  test("inside a toolbar it yields: the toolbar is already the one tab stop", () => {
    render(() => (
      <Toolbar aria-label="Editor">
        <Button>Undo</Button>
        <Group />
        <Button>Redo</Button>
      </Toolbar>
    ));
    flush();
    // Every usable item is reachable by the toolbar's own arrows.
    expect(named("Bold").getAttribute("tabindex")).toBe("0");
    expect(named("Italic").getAttribute("tabindex")).toBe("0");

    user.focus(named("Undo"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Bold"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Italic"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Underline"));
    // Past the group's last item, where a group roving on its own would wrap.
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(named("Redo"));
  });
});
