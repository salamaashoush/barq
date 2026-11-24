import type { Demos } from "../../gallery/types.ts";
import ChartDataTable from "./chart-data-table.tsx";
import chartDataTable from "./chart-data-table.tsx?raw";
import ComboChart from "./combo-chart.tsx";
import comboChart from "./combo-chart.tsx?raw";
import DonutChart from "./donut-chart.tsx";
import donutChart from "./donut-chart.tsx?raw";
import FunnelChart from "./funnel-chart.tsx";
import funnelChart from "./funnel-chart.tsx?raw";
import Gauge from "./gauge.tsx";
import gauge from "./gauge.tsx?raw";
import Heatmap from "./heatmap.tsx";
import heatmap from "./heatmap.tsx?raw";
import ScatterChart from "./scatter-chart.tsx";
import scatterChart from "./scatter-chart.tsx?raw";
import Sparkline from "./sparkline.tsx";
import sparkline from "./sparkline.tsx?raw";

export const demos: Demos = {
  "donut-chart": { component: DonutChart, code: donutChart },
  sparkline: { component: Sparkline, code: sparkline },
  "combo-chart": { component: ComboChart, code: comboChart },
  "scatter-chart": { component: ScatterChart, code: scatterChart },
  "funnel-chart": { component: FunnelChart, code: funnelChart },
  gauge: { component: Gauge, code: gauge },
  heatmap: { component: Heatmap, code: heatmap },
  "chart-data-table": { component: ChartDataTable, code: chartDataTable },
};
