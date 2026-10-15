import { barY, defineChart, group } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { css } from "@barqjs/css";
import { Chart, ChartContainer, type ChartConfig } from "@barqjs/ui";

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
];

const chartConfig: ChartConfig = [
  { key: "desktop", label: "Desktop", color: "#2563eb" },
  { key: "mobile", label: "Mobile", color: "#60a5fa" },
];

const bars = chartData.flatMap((row) => [
  { month: row.month, series: "desktop", value: row.desktop },
  { month: row.month, series: "mobile", value: row.mobile },
]);

const frame = css`
  min-height: 200px;
  width: 100%;
`;

const definition = defineChart({
  marks: [barY(bars, { x: "month", y: "value", color: "series", layout: group(), radius: 4 })],
  scales: {
    x: {
      scale: scaleBand,
      axis: {
        line: false,
        ticks: { size: 0, padding: 10, format: (value: string) => value.slice(0, 3) },
        tickLabels: { fontSize: 12, thin: true },
      },
    },
    y: { scale: scaleLinear, nice: true, grid: true, axis: false },
  },
  color: { domain: ["desktop", "mobile"], range: ["var(--color-desktop)", "var(--color-mobile)"] },
  theme: {
    foreground: "var(--foreground)",
    muted: "var(--muted-foreground)",
    grid: "var(--border)",
    background: "transparent",
  },
});

export default function ChartExampleAxis() {
  return (
    <ChartContainer config={chartConfig} class={frame}>
      <Chart
        definition={definition}
        ariaLabel="Desktop and mobile visitors by month"
        height={200}
      />
    </ChartContainer>
  );
}
