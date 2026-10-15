import type { Demo } from "../../registry.ts";
import SelectAlignItem from "./select-align-item.tsx";
import selectAlignItem from "./select-align-item.tsx?raw";
import SelectDemo from "./select-demo.tsx";
import selectDemo from "./select-demo.tsx?raw";
import SelectDisabled from "./select-disabled.tsx";
import selectDisabled from "./select-disabled.tsx?raw";
import SelectGroups from "./select-groups.tsx";
import selectGroups from "./select-groups.tsx?raw";
import SelectInvalid from "./select-invalid.tsx";
import selectInvalid from "./select-invalid.tsx?raw";
import SelectItemsGrouped from "./select-items-grouped.tsx";
import selectItemsGrouped from "./select-items-grouped.tsx?raw";
import SelectItems from "./select-items.tsx";
import selectItems from "./select-items.tsx?raw";
import SelectRtl from "./select-rtl.tsx";
import selectRtl from "./select-rtl.tsx?raw";
import SelectScrollable from "./select-scrollable.tsx";
import selectScrollable from "./select-scrollable.tsx?raw";

export const demos: readonly Demo[] = [
  { code: selectDemo, component: SelectDemo },
  {
    title: "Align Item With Trigger",
    note: 'Use the `position` prop on `SelectContent` to control alignment. With `position="item-aligned"`, the default, the list opens so the selected item sits over the trigger. With `position="popper"` it hangs off the trigger\'s edge.',
    code: selectAlignItem,
    component: SelectAlignItem,
  },
  {
    title: "Groups",
    note: "Use `SelectGroup`, `SelectLabel`, and `SelectSeparator` to organize items.",
    code: selectGroups,
    component: SelectGroups,
  },
  {
    title: "Scrollable",
    note: "A select with many items that scrolls.",
    code: selectScrollable,
    component: SelectScrollable,
  },
  { title: "Disabled", code: selectDisabled, component: SelectDisabled },
  {
    title: "Invalid",
    note: "Set `isInvalid` on the `Field` and `aria-invalid` on the `SelectTrigger` to show an error state.",
    code: selectInvalid,
    component: SelectInvalid,
  },
  {
    title: "Items",
    note: "Give `Select` an `items` list and a callback, and the trigger, the popover and the list are built from the same values. The callback returns a `SelectItem` for each one.",
    code: selectItems,
    component: SelectItems,
  },
  {
    title: "Grouped Items",
    note: "`getChildren` makes one `items` list a tree. A value with children comes out of the callback as a `SelectGroup`, and each of its children as a `SelectItem`.",
    code: selectItemsGrouped,
    component: SelectItemsGrouped,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: selectRtl,
    component: SelectRtl,
  },
];
