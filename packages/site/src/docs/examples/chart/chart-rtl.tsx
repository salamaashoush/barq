import { barY, defineChart, group } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { css } from "@barqjs/css";
import {
  Chart,
  ChartContainer,
  ChartLegend,
  DirectionProvider,
  type ChartConfig,
} from "@barqjs/ui";

const months: Record<string, string> = {
  january: "يناير",
  february: "فبراير",
  march: "مارس",
  april: "أبريل",
  may: "مايو",
  june: "يونيو",
};

const chartData = [
  { month: "january", desktop: 186, mobile: 80 },
  { month: "february", desktop: 305, mobile: 200 },
  { month: "march", desktop: 237, mobile: 120 },
  { month: "april", desktop: 73, mobile: 190 },
  { month: "may", desktop: 209, mobile: 130 },
  { month: "june", desktop: 214, mobile: 140 },
];

const chartConfig: ChartConfig = [
  { key: "desktop", label: "سطح المكتب", color: "var(--chart-2)" },
  { key: "mobile", label: "الجوال", color: "var(--chart-1)" },
];

const labels: Record<string, string> = { desktop: "سطح المكتب", mobile: "الجوال" };

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
      reverse: true,
      axis: {
        line: false,
        ticks: {
          size: 0,
          padding: 10,
          format: (value: string) => (months[value] ?? value).slice(0, 3),
        },
        tickLabels: { fontSize: 12, thin: true },
      },
    },
    y: { scale: scaleLinear, nice: true, grid: true, side: "right", axis: false },
  },
  color: { domain: ["desktop", "mobile"], range: ["var(--color-desktop)", "var(--color-mobile)"] },
  theme: {
    foreground: "var(--foreground)",
    muted: "var(--muted-foreground)",
    grid: "var(--border)",
    background: "transparent",
  },
  tooltip: {
    use: tooltip,
    format: (point: { datum: unknown }) => {
      const row = point.datum as { series: string; value: number };
      return `${labels[row.series] ?? row.series}: ${String(row.value)}`;
    },
    formatGroup: (points: readonly { datum: unknown }[]) => {
      const row = points[0]?.datum as { month?: string } | undefined;
      return months[row?.month ?? ""] ?? "";
    },
  },
});

export default function ChartRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <ChartContainer config={chartConfig} class={frame}>
          <Chart definition={definition} ariaLabel="الزوار حسب الشهر" height={200} />
          <ChartLegend />
        </ChartContainer>
      </div>
    </DirectionProvider>
  );
}
