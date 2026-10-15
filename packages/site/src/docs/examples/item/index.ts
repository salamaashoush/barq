import type { Demo } from "../../registry.ts";
import ItemAvatar from "./item-avatar.tsx";
import itemAvatar from "./item-avatar.tsx?raw";
import ItemDemo from "./item-demo.tsx";
import itemDemo from "./item-demo.tsx?raw";
import ItemDropdown from "./item-dropdown.tsx";
import itemDropdown from "./item-dropdown.tsx?raw";
import ItemGroupExample from "./item-group.tsx";
import itemGroup from "./item-group.tsx?raw";
import ItemHeaderDemo from "./item-header.tsx";
import itemHeader from "./item-header.tsx?raw";
import ItemIcon from "./item-icon.tsx";
import itemIcon from "./item-icon.tsx?raw";
import ItemImage from "./item-image.tsx";
import itemImage from "./item-image.tsx?raw";
import ItemLink from "./item-link.tsx";
import itemLink from "./item-link.tsx?raw";
import ItemRtl from "./item-rtl.tsx";
import itemRtl from "./item-rtl.tsx?raw";
import ItemSeparatorExample from "./item-separator.tsx";
import itemSeparator from "./item-separator.tsx?raw";
import ItemSize from "./item-size.tsx";
import itemSize from "./item-size.tsx?raw";
import ItemVariant from "./item-variant.tsx";
import itemVariant from "./item-variant.tsx?raw";

export const demos: readonly Demo[] = [
  { code: itemDemo, component: ItemDemo },
  {
    title: "Variant",
    note: "Use the `variant` prop to change the visual style of the item.",
    size: "auto",
    code: itemVariant,
    component: ItemVariant,
  },
  {
    title: "Size",
    note: "Use the `size` prop to change the size of the item. Available sizes are `default`, `sm`, `xs`, and `2xs`.",
    size: "auto",
    code: itemSize,
    component: ItemSize,
  },
  {
    title: "Icon",
    note: 'Use `ItemMedia` with `variant="icon"` to display an icon.',
    code: itemIcon,
    component: ItemIcon,
  },
  {
    title: "Avatar",
    note: "Put an `Avatar` inside `ItemMedia` to display an avatar.",
    code: itemAvatar,
    component: ItemAvatar,
  },
  {
    title: "Image",
    note: 'Use `ItemMedia` with `variant="image"` to display an image.',
    size: "auto",
    code: itemImage,
    component: ItemImage,
  },
  {
    title: "Group",
    note: "Use `ItemGroup` to group related items together.",
    size: "auto",
    code: itemGroup,
    component: ItemGroupExample,
  },
  {
    title: "Header",
    note: "Use `ItemHeader` to add a header above the item content.",
    size: "auto",
    code: itemHeader,
    component: ItemHeaderDemo,
  },
  {
    title: "Link",
    note: "Use the `href` prop to render the item as a link. The hover and focus states are applied to the anchor element. For an attribute `Item` does not take, such as `target`, put `itemVariants` on an anchor of your own.",
    code: itemLink,
    component: ItemLink,
  },
  { title: "Dropdown", code: itemDropdown, component: ItemDropdown },
  {
    title: "Separator",
    note: "Use `ItemSeparator` to draw a rule between the items of a group.",
    code: itemSeparator,
    component: ItemSeparatorExample,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: itemRtl,
    component: ItemRtl,
  },
];
