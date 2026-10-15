import type { Demo } from "../../registry.ts";
import DialogCloseButton from "./dialog-close-button.tsx";
import dialogCloseButton from "./dialog-close-button.tsx?raw";
import DialogDemo from "./dialog-demo.tsx";
import dialogDemo from "./dialog-demo.tsx?raw";
import DialogNoCloseButton from "./dialog-no-close-button.tsx";
import dialogNoCloseButton from "./dialog-no-close-button.tsx?raw";
import DialogRtl from "./dialog-rtl.tsx";
import dialogRtl from "./dialog-rtl.tsx?raw";
import DialogScrollableContent from "./dialog-scrollable-content.tsx";
import dialogScrollableContent from "./dialog-scrollable-content.tsx?raw";
import DialogStickyFooter from "./dialog-sticky-footer.tsx";
import dialogStickyFooter from "./dialog-sticky-footer.tsx?raw";

export const demos: readonly Demo[] = [
  { code: dialogDemo, component: DialogDemo },
  {
    title: "Custom Close Button",
    note: "`DialogClose` is a button that closes the dialog. Give it a `variant` and place it where you want it.",
    code: dialogCloseButton,
    component: DialogCloseButton,
  },
  {
    title: "No Close Button",
    note: "Use `showCloseButton={false}` on `DialogContent` to hide the close button.",
    code: dialogNoCloseButton,
    component: DialogNoCloseButton,
  },
  {
    title: "Sticky Footer",
    note: "Keep actions visible while the content scrolls.",
    code: dialogStickyFooter,
    component: DialogStickyFooter,
  },
  {
    title: "Scrollable Content",
    note: "Long content can scroll while the header stays in view.",
    code: dialogScrollableContent,
    component: DialogScrollableContent,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: dialogRtl,
    component: DialogRtl,
  },
];
