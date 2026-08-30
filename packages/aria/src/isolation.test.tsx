import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@barqjs/testing";
import { Breadcrumb, Breadcrumbs } from "./breadcrumbs.tsx";
import { CheckboxGroup, GroupCheckbox } from "./checkbox.tsx";
import { ColorPicker, ColorSlider } from "./colorpicker.tsx";
import { ComboBox } from "./combobox.tsx";
import { Disclosure, DisclosureButton, DisclosurePanel } from "./disclosure.tsx";
import { GridList, GridListItem } from "./gridlist.tsx";
import { ListBox, Option } from "./listbox.tsx";
import { Menu, MenuItem } from "./menu.tsx";
import { NumberField } from "./numberfield.tsx";
import { Radio, RadioGroup } from "./radio.tsx";
import { Select } from "./select.tsx";
import { Slider, SliderOutput, SliderThumb, SliderTrack } from "./slider.tsx";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "./table.tsx";
import { Tab, TabList, TabPanel, Tabs } from "./tabs.tsx";
import { Tag, TagGroup } from "./tag.tsx";

interface Named {
  id: string;
  name: string;
  [key: string]: unknown;
}
const FRUITS: Named[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
];
const VEG: Named[] = [
  { id: "leek", name: "Leek" },
  { id: "onion", name: "Onion" },
];
const named = (item: Named): string => item.name;

describe("two side by side", () => {
  test("CheckboxGroup", () => {
    render(() => (
      <>
        <CheckboxGroup label="First" defaultValue={["a"]}>
          <GroupCheckbox value="a">A</GroupCheckbox>
        </CheckboxGroup>
        <CheckboxGroup label="Second" defaultValue={[]}>
          <GroupCheckbox value="a">B</GroupCheckbox>
        </CheckboxGroup>
      </>
    ));
    const [a, b] = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(a?.checked).toBe(true);
    expect(b?.checked).toBe(false);
  });

  test("RadioGroup", () => {
    render(() => (
      <>
        <RadioGroup label="First" defaultValue="a">
          <Radio value="a">A</Radio>
        </RadioGroup>
        <RadioGroup label="Second">
          <Radio value="a">B</Radio>
        </RadioGroup>
      </>
    ));
    const [a, b] = screen.getAllByRole<HTMLInputElement>("radio");
    expect(a?.checked).toBe(true);
    expect(b?.checked).toBe(false);
  });

  test("ListBox", () => {
    render(() => (
      <>
        <ListBox
          label="Fruit"
          items={FRUITS}
          selectionMode="single"
          defaultSelectedKeys={["apple"]}
          getTextValue={named}
        >
          {(f: Named) => <Option>{f.name}</Option>}
        </ListBox>
        <ListBox label="Veg" items={VEG} selectionMode="single" getTextValue={named}>
          {(v: Named) => <Option>{v.name}</Option>}
        </ListBox>
      </>
    ));
    const lists = screen.getAllByRole("listbox");
    expect(within(lists[0] as HTMLElement).getAllByRole("option")[0]?.textContent).toBe("Apple");
    expect(within(lists[1] as HTMLElement).getAllByRole("option")[0]?.textContent).toBe("Leek");
    expect(
      within(lists[0] as HTMLElement)
        .getByRole("option", { name: "Apple" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("Menu", () => {
    render(() => (
      <>
        <Menu aria-label="First" items={FRUITS} getTextValue={named}>
          {(f: Named) => <MenuItem>{f.name}</MenuItem>}
        </Menu>
        <Menu aria-label="Second" items={VEG} getTextValue={named}>
          {(v: Named) => <MenuItem>{v.name}</MenuItem>}
        </Menu>
      </>
    ));
    const menus = screen.getAllByRole("menu");
    expect(within(menus[0] as HTMLElement).getAllByRole("menuitem")[0]?.textContent).toBe("Apple");
    expect(within(menus[1] as HTMLElement).getAllByRole("menuitem")[0]?.textContent).toBe("Leek");
  });

  test("Select", () => {
    render(() => (
      <>
        <Select label="Fruit" items={FRUITS} defaultSelectedKey="apple" getTextValue={named}>
          {(f: Named) => <Option>{f.name}</Option>}
        </Select>
        <Select label="Veg" items={VEG} defaultSelectedKey="onion" getTextValue={named}>
          {(v: Named) => <Option>{v.name}</Option>}
        </Select>
      </>
    ));
    const [a, b] = screen.getAllByRole("button");
    expect(a?.textContent).toBe("Apple");
    expect(b?.textContent).toBe("Onion");
  });

  test("ComboBox", () => {
    render(() => (
      <>
        <ComboBox label="Fruit" items={FRUITS} defaultInputValue="Apple" getTextValue={named}>
          {(f: Named) => <Option>{f.name}</Option>}
        </ComboBox>
        <ComboBox label="Veg" items={VEG} defaultInputValue="Leek" getTextValue={named}>
          {(v: Named) => <Option>{v.name}</Option>}
        </ComboBox>
      </>
    ));
    const [a, b] = screen.getAllByRole<HTMLInputElement>("combobox");
    expect(a?.value).toBe("Apple");
    expect(b?.value).toBe("Leek");
  });

  test("Tabs", () => {
    const A: Named[] = [{ id: "one", name: "One" }];
    const B: Named[] = [{ id: "two", name: "Two" }];
    render(() => (
      <>
        <Tabs aria-label="First" items={A} getTextValue={named}>
          <TabList>{(t: Named) => <Tab>{t.name}</Tab>}</TabList>
          <TabPanel>{(t: Named) => <div>Panel {t.name}</div>}</TabPanel>
        </Tabs>
        <Tabs aria-label="Second" items={B} getTextValue={named}>
          <TabList>{(t: Named) => <Tab>{t.name}</Tab>}</TabList>
          <TabPanel>{(t: Named) => <div>Panel {t.name}</div>}</TabPanel>
        </Tabs>
      </>
    ));
    const panels = screen.getAllByRole("tabpanel");
    expect(panels[0]?.textContent).toContain("One");
    expect(panels[1]?.textContent).toContain("Two");
  });

  test("Slider", () => {
    render(() => (
      <>
        <Slider label="First" defaultValue={10}>
          <SliderOutput />
          <SliderTrack>{() => <SliderThumb />}</SliderTrack>
        </Slider>
        <Slider label="Second" defaultValue={90}>
          <SliderOutput />
          <SliderTrack>{() => <SliderThumb />}</SliderTrack>
        </Slider>
      </>
    ));
    const outputs = [...document.querySelectorAll("output")];
    expect(outputs[0]?.textContent).toBe("10");
    expect(outputs[1]?.textContent).toBe("90");
  });

  test("NumberField", () => {
    render(() => (
      <>
        <NumberField label="First" defaultValue={3} />
        <NumberField label="Second" defaultValue={7} />
      </>
    ));
    const [a, b] = screen.getAllByRole<HTMLInputElement>("textbox");
    expect(a?.value).toBe("3");
    expect(b?.value).toBe("7");
  });

  test("Disclosure", () => {
    render(() => (
      <>
        <Disclosure defaultExpanded>
          <DisclosureButton>First</DisclosureButton>
          <DisclosurePanel>Body one</DisclosurePanel>
        </Disclosure>
        <Disclosure>
          <DisclosureButton>Second</DisclosureButton>
          <DisclosurePanel>Body two</DisclosurePanel>
        </Disclosure>
      </>
    ));
    const [a, b] = screen.getAllByRole("button");
    expect(a?.getAttribute("aria-expanded")).toBe("true");
    expect(b?.getAttribute("aria-expanded")).toBe("false");
  });

  test("Breadcrumbs", () => {
    render(() => (
      <>
        <Breadcrumbs aria-label="First" items={FRUITS} getTextValue={named}>
          {(f: Named) => <Breadcrumb>{f.name}</Breadcrumb>}
        </Breadcrumbs>
        <Breadcrumbs aria-label="Second" items={VEG} getTextValue={named}>
          {(v: Named) => <Breadcrumb>{v.name}</Breadcrumb>}
        </Breadcrumbs>
      </>
    ));
    const trails = screen.getAllByRole("navigation");
    expect(trails[0]?.textContent).toContain("Apple");
    expect(trails[1]?.textContent).toContain("Leek");
    expect(trails[0]?.textContent).not.toContain("Leek");
  });

  test("TagGroup", () => {
    render(() => (
      <>
        <TagGroup label="First" items={FRUITS} getTextValue={named}>
          {(f: Named) => <Tag>{f.name}</Tag>}
        </TagGroup>
        <TagGroup label="Second" items={VEG} getTextValue={named}>
          {(v: Named) => <Tag>{v.name}</Tag>}
        </TagGroup>
      </>
    ));
    const groups = screen.getAllByRole("grid");
    expect(groups[0]?.textContent).toContain("Apple");
    expect(groups[1]?.textContent).toContain("Leek");
    expect(groups[0]?.textContent).not.toContain("Leek");
  });

  test("GridList", () => {
    render(() => (
      <>
        <GridList aria-label="First" items={FRUITS} getTextValue={named}>
          {(f: Named) => <GridListItem>{f.name}</GridListItem>}
        </GridList>
        <GridList aria-label="Second" items={VEG} getTextValue={named}>
          {(v: Named) => <GridListItem>{v.name}</GridListItem>}
        </GridList>
      </>
    ));
    const grids = screen.getAllByRole("grid");
    expect(grids[0]?.textContent).toContain("Apple");
    expect(grids[1]?.textContent).toContain("Leek");
    expect(grids[0]?.textContent).not.toContain("Leek");
  });

  test("Table", () => {
    const COLUMNS: Named[] = [{ id: "name", name: "Name", isRowHeader: true }];
    render(() => (
      <>
        <Table aria-label="First" columns={COLUMNS} items={FRUITS}>
          <TableHeader>{(c: Named) => <Column>{c.name}</Column>}</TableHeader>
          <TableBody>{(f: Named) => <Row>{() => <Cell>{f.name}</Cell>}</Row>}</TableBody>
        </Table>
        <Table aria-label="Second" columns={COLUMNS} items={VEG}>
          <TableHeader>{(c: Named) => <Column>{c.name}</Column>}</TableHeader>
          <TableBody>{(v: Named) => <Row>{() => <Cell>{v.name}</Cell>}</Row>}</TableBody>
        </Table>
      </>
    ));
    const grids = screen.getAllByRole("grid");
    expect(grids[0]?.textContent).toContain("Apple");
    expect(grids[1]?.textContent).toContain("Leek");
    expect(grids[0]?.textContent).not.toContain("Leek");
  });

  test("ColorPicker", () => {
    render(() => (
      <>
        <ColorPicker defaultValue="hsl(0, 100%, 50%)">
          <ColorSlider channel="hue" />
        </ColorPicker>
        <ColorPicker defaultValue="hsl(200, 100%, 50%)">
          <ColorSlider channel="hue" />
        </ColorPicker>
      </>
    ));
    const [a, b] = screen.getAllByRole<HTMLInputElement>("slider");
    expect(a?.value).toBe("0");
    expect(b?.value).toBe("200");
  });
});
