import type { Demo } from "../../registry.ts";
import AlertActionExample from "./alert-action.tsx";
import alertAction from "./alert-action.tsx?raw";
import AlertBasic from "./alert-basic.tsx";
import alertBasic from "./alert-basic.tsx?raw";
import AlertColors from "./alert-colors.tsx";
import alertColors from "./alert-colors.tsx?raw";
import AlertDemo from "./alert-demo.tsx";
import alertDemo from "./alert-demo.tsx?raw";
import AlertDestructive from "./alert-destructive.tsx";
import alertDestructive from "./alert-destructive.tsx?raw";
import AlertRtl from "./alert-rtl.tsx";
import alertRtl from "./alert-rtl.tsx?raw";
import AlertTitleOnly from "./alert-title-only.tsx";
import alertTitleOnly from "./alert-title-only.tsx?raw";

export const demos: readonly Demo[] = [
  { code: alertDemo, component: AlertDemo },
  {
    title: "Basic",
    note: "A basic alert with an icon, title and description.",
    code: alertBasic,
    component: AlertBasic,
  },
  {
    title: "Destructive",
    note: 'Use `variant="destructive"` to create a destructive alert.',
    code: alertDestructive,
    component: AlertDestructive,
  },
  {
    title: "Action",
    note: "Use `AlertAction` to add a button or other action element to the alert.",
    code: alertAction,
    component: AlertActionExample,
  },
  {
    title: "Custom Colors",
    note: "Pass a `class` that sets the border, background and text colors to customize the alert. A `.dark &` rule covers dark mode.",
    code: alertColors,
    component: AlertColors,
  },
  {
    title: "Title only",
    note: "The description is optional, and without it the title is the whole alert.",
    code: alertTitleOnly,
    component: AlertTitleOnly,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: alertRtl,
    component: AlertRtl,
  },
];
