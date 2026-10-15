import type { Demo } from "../../registry.ts";
import BreadcrumbBasic from "./breadcrumb-basic.tsx";
import breadcrumbBasic from "./breadcrumb-basic.tsx?raw";
import BreadcrumbDemo from "./breadcrumb-demo.tsx";
import breadcrumbDemo from "./breadcrumb-demo.tsx?raw";
import BreadcrumbDropdown from "./breadcrumb-dropdown.tsx";
import breadcrumbDropdown from "./breadcrumb-dropdown.tsx?raw";
import BreadcrumbEllipsisDemo from "./breadcrumb-ellipsis.tsx";
import breadcrumbEllipsis from "./breadcrumb-ellipsis.tsx?raw";
import BreadcrumbRtl from "./breadcrumb-rtl.tsx";
import breadcrumbRtl from "./breadcrumb-rtl.tsx?raw";
import BreadcrumbSeparatorDemo from "./breadcrumb-separator.tsx";
import breadcrumbSeparator from "./breadcrumb-separator.tsx?raw";

export const demos: readonly Demo[] = [
  { code: breadcrumbDemo, component: BreadcrumbDemo },
  {
    title: "Basic",
    note: "A basic breadcrumb with a home link and a components link.",
    code: breadcrumbBasic,
    component: BreadcrumbBasic,
  },
  {
    title: "Custom separator",
    note: "Use a custom component as `children` for `BreadcrumbSeparator` to create a custom separator.",
    code: breadcrumbSeparator,
    component: BreadcrumbSeparatorDemo,
  },
  {
    title: "Dropdown",
    note: "You can compose `BreadcrumbItem` with a `DropdownMenu` to create a dropdown in the breadcrumb. A plain `<button>` takes the trigger's props and ref through `render` on `DropdownMenuTrigger`.",
    code: breadcrumbDropdown,
    component: BreadcrumbDropdown,
  },
  {
    title: "Collapsed",
    note: "Use the `BreadcrumbEllipsis` component to show a collapsed state when the breadcrumb is too long.",
    code: breadcrumbEllipsis,
    component: BreadcrumbEllipsisDemo,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: breadcrumbRtl,
    component: BreadcrumbRtl,
  },
];
