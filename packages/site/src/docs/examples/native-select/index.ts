import type { Demo } from "../../registry.ts";
import NativeSelectDemo from "./native-select-demo.tsx";
import nativeSelectDemo from "./native-select-demo.tsx?raw";
import NativeSelectGroups from "./native-select-groups.tsx";
import nativeSelectGroups from "./native-select-groups.tsx?raw";
import NativeSelectDisabled from "./native-select-disabled.tsx";
import nativeSelectDisabled from "./native-select-disabled.tsx?raw";
import NativeSelectInvalid from "./native-select-invalid.tsx";
import nativeSelectInvalid from "./native-select-invalid.tsx?raw";
import NativeSelectRtl from "./native-select-rtl.tsx";
import nativeSelectRtl from "./native-select-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: nativeSelectDemo,
    component: NativeSelectDemo,
  },
  {
    title: "Groups",
    note: "Use `NativeSelectOptGroup` to organize options into categories.",
    code: nativeSelectGroups,
    component: NativeSelectGroups,
  },
  {
    title: "Disabled",
    note: "Add the `disabled` prop to the `NativeSelect` component to disable the select.",
    code: nativeSelectDisabled,
    component: NativeSelectDisabled,
  },
  {
    title: "Invalid",
    note: "Use `aria-invalid` to show validation errors and the `isInvalid` prop on the `Field` component for styling.",
    code: nativeSelectInvalid,
    component: NativeSelectInvalid,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The chevron moves to the inline end.",
    rtl: true,
    code: nativeSelectRtl,
    component: NativeSelectRtl,
  },
];
