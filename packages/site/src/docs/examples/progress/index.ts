import type { Demo } from "../../registry.ts";
import ProgressControlled from "./progress-controlled.tsx";
import progressControlled from "./progress-controlled.tsx?raw";
import ProgressDemo from "./progress-demo.tsx";
import progressDemo from "./progress-demo.tsx?raw";
import ProgressLabel from "./progress-label.tsx";
import progressLabel from "./progress-label.tsx?raw";
import ProgressRtl from "./progress-rtl.tsx";
import progressRtl from "./progress-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: progressDemo,
    component: ProgressDemo,
  },
  {
    title: "Label",
    note: "Use a `Field` component to add a label to the progress bar, and name the bar with `aria-labelledby`.",
    code: progressLabel,
    component: ProgressLabel,
  },
  {
    title: "Controlled",
    note: "A progress bar that follows a signal, set here by a slider.",
    code: progressControlled,
    component: ProgressControlled,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: progressRtl,
    component: ProgressRtl,
  },
];
