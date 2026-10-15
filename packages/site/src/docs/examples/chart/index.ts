import type { Demo } from "../../registry.ts";
import ChartDemo from "./chart-demo.tsx";
import chartDemo from "./chart-demo.tsx?raw";
import ChartExample from "./chart-example.tsx";
import chartExample from "./chart-example.tsx?raw";
import ChartExampleGrid from "./chart-example-grid.tsx";
import chartExampleGrid from "./chart-example-grid.tsx?raw";
import ChartExampleAxis from "./chart-example-axis.tsx";
import chartExampleAxis from "./chart-example-axis.tsx?raw";
import ChartExampleTooltip from "./chart-example-tooltip.tsx";
import chartExampleTooltip from "./chart-example-tooltip.tsx?raw";
import ChartExampleLegend from "./chart-example-legend.tsx";
import chartExampleLegend from "./chart-example-legend.tsx?raw";
import ChartTooltip from "./chart-tooltip.tsx";
import chartTooltip from "./chart-tooltip.tsx?raw";
import ChartRtl from "./chart-rtl.tsx";
import chartRtl from "./chart-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    size: "auto",
    code: chartDemo,
    component: ChartDemo,
  },
  {
    title: "Your First Chart",
    note: "Define the data and a config for its series, then draw the bars. `ChartContainer` declares a `--color-<key>` for every series, which the bars read.",
    size: "auto",
    code: chartExample,
    component: ChartExample,
  },
  {
    title: "Add a Grid",
    note: "`grid: true` on the value scale draws the horizontal rules.",
    size: "auto",
    code: chartExampleGrid,
    component: ChartExampleGrid,
  },
  {
    title: "Add an Axis",
    note: "An axis on the band scale labels each column, here shortened to three letters by a tick `format`.",
    size: "auto",
    code: chartExampleAxis,
    component: ChartExampleAxis,
  },
  {
    title: "Add a Tooltip",
    note: "The tooltip is a chart extension on the definition: it shows every series at the column under the pointer or the keyboard.",
    size: "auto",
    code: chartExampleTooltip,
    component: ChartExampleTooltip,
  },
  {
    title: "Add a Legend",
    note: "`ChartLegend` reads the series from the container's config.",
    size: "auto",
    code: chartExampleLegend,
    component: ChartExampleLegend,
  },
  {
    title: "Tooltip",
    note: "`ChartTooltipContent` is a component of its own: a label, a name and value per series, and a `dot`, `line` or `dashed` indicator.",
    size: "auto",
    code: chartTooltip,
    component: ChartTooltip,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider`. `reverse` on the band scale runs the months from the inline start, and `side` puts the value scale on the right.",
    size: "auto",
    rtl: true,
    code: chartRtl,
    component: ChartRtl,
  },
];
