import type { Demo } from "../../registry.ts";
import AlertDialogBasic from "./alert-dialog-basic.tsx";
import alertDialogBasic from "./alert-dialog-basic.tsx?raw";
import AlertDialogDemo from "./alert-dialog-demo.tsx";
import alertDialogDemo from "./alert-dialog-demo.tsx?raw";
import AlertDialogDestructive from "./alert-dialog-destructive.tsx";
import alertDialogDestructive from "./alert-dialog-destructive.tsx?raw";
import AlertDialogWithMedia from "./alert-dialog-media.tsx";
import alertDialogWithMedia from "./alert-dialog-media.tsx?raw";
import AlertDialogRtl from "./alert-dialog-rtl.tsx";
import alertDialogRtl from "./alert-dialog-rtl.tsx?raw";
import AlertDialogSmallMedia from "./alert-dialog-small-media.tsx";
import alertDialogSmallMedia from "./alert-dialog-small-media.tsx?raw";
import AlertDialogSmall from "./alert-dialog-small.tsx";
import alertDialogSmall from "./alert-dialog-small.tsx?raw";

export const demos: readonly Demo[] = [
  { code: alertDialogDemo, component: AlertDialogDemo },
  {
    title: "Basic",
    note: "A basic alert dialog with a title, description, and cancel and continue buttons.",
    code: alertDialogBasic,
    component: AlertDialogBasic,
  },
  {
    title: "Small",
    note: 'Use `size="sm"` on `AlertDialogContent` to make the alert dialog smaller.',
    code: alertDialogSmall,
    component: AlertDialogSmall,
  },
  {
    title: "Media",
    note: "Use the `AlertDialogMedia` component to add a media element such as an icon to the alert dialog.",
    code: alertDialogWithMedia,
    component: AlertDialogWithMedia,
  },
  {
    title: "Small with Media",
    note: 'Use `size="sm"` on `AlertDialogContent` to make the alert dialog smaller and the `AlertDialogMedia` component to add a media element such as an icon.',
    code: alertDialogSmallMedia,
    component: AlertDialogSmallMedia,
  },
  {
    title: "Destructive",
    note: 'Pass `variant="destructive"` to `AlertDialogAction` for an action that deletes something.',
    code: alertDialogDestructive,
    component: AlertDialogDestructive,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: alertDialogRtl,
    component: AlertDialogRtl,
  },
];
