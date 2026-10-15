import type { Demo } from "../../registry.ts";
import SonnerDemo from "./sonner-demo.tsx";
import sonnerDemo from "./sonner-demo.tsx?raw";
import SonnerTypes from "./sonner-types.tsx";
import sonnerTypes from "./sonner-types.tsx?raw";
import SonnerDescription from "./sonner-description.tsx";
import sonnerDescription from "./sonner-description.tsx?raw";
import SonnerPosition from "./sonner-position.tsx";
import sonnerPosition from "./sonner-position.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: sonnerDemo,
    component: SonnerDemo,
  },
  {
    title: "Types",
    note: "Every toast lands in the one `<Toaster />` the application renders, which this page does.",
    code: sonnerTypes,
    component: SonnerTypes,
  },
  {
    title: "Description",
    code: sonnerDescription,
    component: SonnerDescription,
  },
  {
    title: "Position",
    note: "Use the `position` prop to change the position of the toast.",
    code: sonnerPosition,
    component: SonnerPosition,
  },
];
