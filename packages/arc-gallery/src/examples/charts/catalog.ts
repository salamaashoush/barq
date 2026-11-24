import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "charts",
  title: "Charts",
  description: "Charts in the theme's ramp, each with the table a screen reader reads.",
  examples: [
    {
      id: "donut-chart",
      title: "Donut chart",
      description:
        "Part of a whole in tones or the theme's ramp, its table hidden, behind a button or shown.",
      covers: ["DonutChart"],
    },
    {
      id: "sparkline",
      title: "Sparklines",
      description: "A line, an area and bars, and a column of them on one shared scale.",
      covers: ["Sparkline"],
    },
    {
      id: "combo-chart",
      title: "Combo chart",
      description: "Bars and a line on two scales, and bars stacked or grouped.",
      covers: ["ComboChart"],
    },
    {
      id: "scatter-chart",
      title: "Scatter and bubble charts",
      description: "Two measures per account coloured by plan, and a third as each bubble's size.",
      covers: ["ScatterChart"],
    },
    {
      id: "funnel-chart",
      title: "Funnel chart",
      description: "Stages narrowing to the outcome, with each stage's share of the first.",
      covers: ["FunnelChart"],
    },
    {
      id: "gauge",
      title: "Gauge",
      description: "One reading against its range, its tone changing at each threshold.",
      covers: ["Gauge"],
    },
    {
      id: "heatmap",
      title: "Heatmap",
      description: "A number over two categories in shades from muted to a tone, with a key.",
      covers: ["Heatmap"],
    },
    {
      id: "chart-data-table",
      title: "A table beside one of ui's charts",
      description:
        "ui's ChartBars with its tooltip and legend, and the same numbers as a ChartDataTable.",
      covers: ["ChartDataTable", "ChartContainer", "ChartBars"],
    },
  ],
};
