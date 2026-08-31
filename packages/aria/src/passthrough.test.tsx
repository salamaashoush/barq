/**
 * What a component does with a prop it has no opinion about.
 *
 * `<Button>` has always forwarded the global attributes, the global events and
 * anything `data-*`; the rest of the components accepted `data-testid` and
 * dropped everything else, so a design system built on top of them could not
 * put its own `data-slot` on the element it was styling. They all go through
 * `filterDOMProps(options, { global: true })` now, and this is the check that
 * they still do.
 */

import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";

import { Button } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import { ProgressBar, Separator } from "./link.tsx";
import { Radio, RadioGroup } from "./radio.tsx";
import { Switch } from "./switch.tsx";
import { TabList, TabPanel, Tabs } from "./tabs.tsx";

function attributesOf(node: Element): Record<string, string> {
  return Object.fromEntries([...node.attributes].map((a) => [a.name, a.value]));
}

describe("a component forwards what it has no opinion about", () => {
  test("data-* reaches the element", () => {
    const { container } = render(() => (
      <>
        <Button data-slot="button">Save</Button>
        <Checkbox data-slot="checkbox" />
        <Switch data-slot="switch" />
        <Separator data-slot="separator" />
        <ProgressBar data-slot="progress" aria-label="Upload" value={40} />
      </>
    ));

    for (const slot of ["button", "checkbox", "switch", "separator", "progress"]) {
      expect(
        container.querySelector(`[data-slot="${slot}"]`),
        `<${slot}> dropped the data-slot it was given`,
      ).not.toBeNull();
    }
  });

  test("a global attribute reaches it too", () => {
    const { container } = render(() => (
      <Button dir="rtl" lang="ar" data-testid="save">
        احفظ
      </Button>
    ));
    const attributes = attributesOf(container.querySelector('[data-testid="save"]')!);
    expect(attributes["dir"]).toBe("rtl");
    expect(attributes["lang"]).toBe("ar");
  });

  test("a prop the component owns does not become an attribute", () => {
    const { container } = render(() => <Checkbox data-slot="checkbox" isDisabled />);
    const attributes = attributesOf(container.querySelector('[data-slot="checkbox"]')!);
    expect(attributes["isdisabled"]).toBeUndefined();
    expect(attributes["data-disabled"]).toBe("");
  });

  test("a collection's parts each forward their own", () => {
    const { container } = render(() => (
      <Tabs data-slot="tabs" items={[{ id: "one", title: "One" }]}>
        {() => (
          <>
            <TabList data-slot="tab-list">
              {(item: { id: string; title: string }) => <span>{item.title}</span>}
            </TabList>
            <TabPanel data-slot="tab-panel">One</TabPanel>
          </>
        )}
      </Tabs>
    ));
    for (const slot of ["tabs", "tab-list"]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
  });

  test("a radio inside a group forwards its own", () => {
    const { container } = render(() => (
      <RadioGroup data-slot="radio-group" label="Size">
        <Radio value="s" data-slot="radio">
          Small
        </Radio>
      </RadioGroup>
    ));
    expect(container.querySelector('[data-slot="radio-group"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="radio"]')).not.toBeNull();
  });
});
