import type { ComponentDoc, Demo } from "../../registry.ts";
import DirectionDemo from "./direction-demo.tsx";
import directionDemo from "./direction-demo.tsx?raw";
import DirectionUseDirection from "./direction-use-direction.tsx";
import directionUseDirection from "./direction-use-direction.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    rtl: true,
    code: directionDemo,
    component: DirectionDemo,
  },
  {
    title: "useDirection",
    note: "`useDirection` reads the direction in scope. `DirectionProvider` renders no element, so `dir` goes on an element you own: the provider turns the arrow keys and the side a submenu opens on, and the attribute turns the layout.",
    code: directionUseDirection,
    component: DirectionUseDirection,
  },
];

export const doc: ComponentDoc = {
  slug: "direction",
  title: "Direction",
  description: "A provider component that sets the text direction for your application.",
  usage:
    'import { DirectionProvider } from "@barqjs/ui";\n\n<DirectionProvider dir="rtl">\n  <div dir="rtl">\n    <App />\n  </div>\n</DirectionProvider>',
  demos,
};
