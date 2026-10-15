import { For, createMemo, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chart,
  ChartContainer,
  type ChartConfig,
} from "@barqjs/ui";

const chartData = [
  { date: "2024-04-01", desktop: 222, mobile: 150 },
  { date: "2024-04-02", desktop: 97, mobile: 180 },
  { date: "2024-04-03", desktop: 167, mobile: 120 },
  { date: "2024-04-04", desktop: 242, mobile: 260 },
  { date: "2024-04-05", desktop: 373, mobile: 290 },
  { date: "2024-04-06", desktop: 301, mobile: 340 },
  { date: "2024-04-07", desktop: 245, mobile: 180 },
  { date: "2024-04-08", desktop: 409, mobile: 320 },
  { date: "2024-04-09", desktop: 59, mobile: 110 },
  { date: "2024-04-10", desktop: 261, mobile: 190 },
  { date: "2024-04-11", desktop: 327, mobile: 350 },
  { date: "2024-04-12", desktop: 292, mobile: 210 },
  { date: "2024-04-13", desktop: 342, mobile: 380 },
  { date: "2024-04-14", desktop: 137, mobile: 220 },
  { date: "2024-04-15", desktop: 120, mobile: 170 },
  { date: "2024-04-16", desktop: 138, mobile: 190 },
  { date: "2024-04-17", desktop: 446, mobile: 360 },
  { date: "2024-04-18", desktop: 364, mobile: 410 },
  { date: "2024-04-19", desktop: 243, mobile: 180 },
  { date: "2024-04-20", desktop: 89, mobile: 150 },
  { date: "2024-04-21", desktop: 137, mobile: 200 },
  { date: "2024-04-22", desktop: 224, mobile: 170 },
  { date: "2024-04-23", desktop: 138, mobile: 230 },
  { date: "2024-04-24", desktop: 387, mobile: 290 },
  { date: "2024-04-25", desktop: 215, mobile: 250 },
  { date: "2024-04-26", desktop: 75, mobile: 130 },
  { date: "2024-04-27", desktop: 383, mobile: 420 },
  { date: "2024-04-28", desktop: 122, mobile: 180 },
  { date: "2024-04-29", desktop: 315, mobile: 240 },
  { date: "2024-04-30", desktop: 454, mobile: 380 },
];

type Series = "desktop" | "mobile";

const chartConfig: ChartConfig = [
  { key: "desktop", label: "Desktop", color: "var(--chart-2)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-1)" },
];

const labels: Record<Series, string> = { desktop: "Desktop", mobile: "Mobile" };

const total: Record<Series, number> = {
  desktop: chartData.reduce((sum, row) => sum + row.desktop, 0),
  mobile: chartData.reduce((sum, row) => sum + row.mobile, 0),
};

const day = (value: string, year?: "numeric"): string =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year });

const card = css`
  padding-block: 0 calc(var(--spacing) * 4);
`;

const header = css`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  padding: 0 !important;

  @media (width >= 40rem) {
    flex-direction: row;
  }
`;

const heading = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: calc(var(--spacing) * 1);
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 6) calc(var(--spacing) * 3);

  @media (width >= 40rem) {
    padding-block: 0 !important;
  }
`;

const tabs = css`
  display: flex;
`;

const tab = css`
  position: relative;
  z-index: 30;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: calc(var(--spacing) * 1);
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 6);
  text-align: start;
  color: inherit;
  font: inherit;

  & + & {
    border-inline-start: 1px solid var(--border);
  }
  &[data-active="true"] {
    background-color: color-mix(in oklab, var(--muted) 50%, transparent);
  }

  @media (width >= 40rem) {
    border-top: 0;
    border-inline-start: 1px solid var(--border);
    padding: calc(var(--spacing) * 6) calc(var(--spacing) * 8);
  }
`;

const caption = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

const figure = css`
  font-size: 1.125rem;
  line-height: 1;
  font-weight: 700;

  @media (width >= 40rem) {
    font-size: 1.875rem;
  }
`;

const content = css`
  padding-inline: calc(var(--spacing) * 2);

  @media (width >= 40rem) {
    padding: calc(var(--spacing) * 6);
  }
`;

const plot = css`
  height: 250px;
  width: 100%;
`;

export default function ChartDemo() {
  const [activeChart, setActiveChart] = createSignal<Series>("desktop");

  const definition = createMemo(() => {
    const series = activeChart();
    return defineChart({
      marks: [
        barY(
          chartData.map((row) => ({ date: row.date, series, value: row[series] })),
          { x: "date", y: "value", color: "series" },
        ),
      ],
      scales: {
        x: {
          scale: scaleBand,
          axis: {
            line: false,
            ticks: { size: 0, padding: 8, format: (value: string) => day(value) },
            tickLabels: { fontSize: 12, thin: true },
          },
        },
        y: { scale: scaleLinear, nice: true, grid: true, axis: false },
      },
      color: { domain: [series], range: [`var(--color-${series})`] },
      theme: {
        foreground: "var(--foreground)",
        muted: "var(--muted-foreground)",
        grid: "var(--border)",
        background: "transparent",
      },
      tooltip: {
        use: tooltip,
        format: (point: { datum: unknown }) => {
          const row = point.datum as { value: number };
          return `Page Views: ${row.value.toLocaleString()}`;
        },
        formatGroup: (points: readonly { datum: unknown }[]) => {
          const row = points[0]?.datum as { date?: string } | undefined;
          return row?.date === undefined ? "" : day(row.date, "numeric");
        },
      },
    });
  });

  return (
    <Card class={card}>
      <CardHeader class={header}>
        <div class={heading}>
          <CardTitle>Bar Chart - Interactive</CardTitle>
          <CardDescription>Showing total visitors for the last 3 months</CardDescription>
        </div>
        <div class={tabs}>
          <For each={["desktop", "mobile"] as const}>
            {(key: Series) => (
              <button
                type="button"
                class={tab}
                data-active={activeChart() === key ? "true" : "false"}
                aria-pressed={activeChart() === key}
                onClick={() => setActiveChart(key)}
              >
                <span class={caption}>{labels[key]}</span>
                <span class={figure}>{total[key].toLocaleString()}</span>
              </button>
            )}
          </For>
        </div>
      </CardHeader>
      <CardContent class={content}>
        <ChartContainer config={chartConfig} class={plot}>
          <Chart definition={definition()} ariaLabel="Visitors by day" height={250} />
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
