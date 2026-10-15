import { describe, expect, test } from "bun:test";
import { Tab, TabList, TabPanel, Tabs } from "@barqjs/aria/tabs";
import { createSignal, flush, type Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { DirectionProvider, useDirection } from "./direction.tsx";

interface Section {
  id: string;
  name: string;
}

const SECTIONS: Section[] = [
  { id: "account", name: "Account" },
  { id: "billing", name: "Billing" },
  { id: "team", name: "Team" },
];

function Sections() {
  return (
    <Tabs items={SECTIONS}>
      <TabList aria-label="Settings">{(section: Section) => <Tab>{section.name}</Tab>}</TabList>
      <TabPanel>{(section: Section) => <p>{section.name}</p>}</TabPanel>
    </Tabs>
  );
}

function Reads(props: Incoming<{ local?: "ltr" | "rtl" }>) {
  const direction = useDirection(props.local);
  return <output data-testid="direction">{direction()}</output>;
}

const read = (): string | null => screen.getByTestId("direction").textContent;

describe("DirectionProvider", () => {
  test("it renders nothing of its own, so it cannot break a layout it wraps", () => {
    const { container } = render(() => (
      <DirectionProvider dir="rtl">
        <p>salama</p>
      </DirectionProvider>
    ));
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe("P");
  });

  test("the subtree reads the declared direction", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <Reads />
      </DirectionProvider>
    ));
    expect(read()).toBe("rtl");
  });

  test("direction is the same prop under upstream's other name, and wins over dir", () => {
    render(() => (
      <DirectionProvider dir="ltr" direction="rtl">
        <Reads />
      </DirectionProvider>
    ));
    expect(read()).toBe("rtl");
  });

  test("the nearest provider wins", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <DirectionProvider dir="ltr">
          <Reads />
        </DirectionProvider>
      </DirectionProvider>
    ));
    expect(read()).toBe("ltr");
  });

  test("a provider given neither prop leaves the direction it inherited", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <DirectionProvider>
          <Reads />
        </DirectionProvider>
      </DirectionProvider>
    ));
    expect(read()).toBe("rtl");
  });

  test("a direction that changes moves every reader", () => {
    const [direction, setDirection] = createSignal<"ltr" | "rtl">("ltr");
    render(() => (
      <DirectionProvider dir={direction()}>
        <Reads />
      </DirectionProvider>
    ));
    expect(read()).toBe("ltr");
    setDirection("rtl");
    flush();
    expect(read()).toBe("rtl");
  });

  test("a component's own direction overrides the one in scope", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <Reads local="ltr" />
      </DirectionProvider>
    ));
    expect(read()).toBe("ltr");
  });

  test("left to right, the right arrow moves to the next tab", () => {
    render(() => (
      <DirectionProvider dir="ltr">
        <Sections />
      </DirectionProvider>
    ));
    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("right to left, the left arrow moves to the next tab instead", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <Sections />
      </DirectionProvider>
    ));
    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[0] as HTMLElement);
  });
});
