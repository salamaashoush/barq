import {
  ChartBars,
  ChartContainer,
  ChartDataTable,
  ChartLegend,
  ChartTooltip,
  Stack,
} from "@barqjs/arc";

const SIGNUPS = [
  { month: "Jul", web: 320, mobile: 180 },
  { month: "Aug", web: 360, mobile: 210 },
  { month: "Sep", web: 410, mobile: 260 },
  { month: "Oct", web: 390, mobile: 300 },
  { month: "Nov", web: 455, mobile: 340 },
];

export default function ChartDataTableExample() {
  return (
    <Stack gap={4}>
      <ChartContainer
        config={{
          web: { label: "Web", color: "var(--chart-1)" },
          mobile: { label: "Mobile", color: "var(--chart-2)" },
        }}
      >
        <ChartBars data={SIGNUPS} x="month" height={220} aria-describedby="signups-table" />
        <ChartTooltip />
        <ChartLegend />
      </ChartContainer>
      <ChartDataTable
        id="signups-table"
        label="Sign-ups by month and platform"
        data={{
          columns: [
            { label: "Month" },
            { label: "Web", numeric: true },
            { label: "Mobile", numeric: true },
          ],
          rows: SIGNUPS.map((row) => [row.month, String(row.web), String(row.mobile)]),
        }}
      />
    </Stack>
  );
}
