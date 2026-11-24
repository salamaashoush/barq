import { createSignal } from "@barqjs/core";
import { DonutChart, Grid, Stack, Text, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";

const CHECKS = [
  { key: "up", label: "Up", value: 42, tone: "success" as const },
  { key: "degraded", label: "Degraded", value: 5, tone: "warning" as const },
  { key: "down", label: "Down", value: 3, tone: "danger" as const },
  { key: "paused", label: "Paused", value: 6, tone: "neutral" as const },
];

const PLANS = [
  { key: "starter", label: "Starter", value: 18_400 },
  { key: "team", label: "Team", value: 46_900 },
  { key: "business", label: "Business", value: 63_200 },
];

type Table = "hidden" | "toggle" | "visible";

export default function DonutChartExample() {
  const [table, setTable] = createSignal<Table>("toggle");

  return (
    <Stack gap={4}>
      <ToggleGroup
        aria-label="Data table"
        variant="outline"
        size="sm"
        value={table()}
        onChange={(value) => {
          const next = value[0];
          if (next === "hidden" || next === "toggle" || next === "visible") setTable(next);
        }}
      >
        <ToggleGroupItem value="hidden">Table hidden</ToggleGroupItem>
        <ToggleGroupItem value="toggle">Behind a button</ToggleGroupItem>
        <ToggleGroupItem value="visible">Visible</ToggleGroupItem>
      </ToggleGroup>
      <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
        <DonutChart
          label="Checks by state"
          data={CHECKS}
          centreLabel="checks"
          table={table()}
          height={240}
        />
        <Stack gap={2}>
          <DonutChart
            label="Revenue by plan, November"
            data={PLANS}
            centreValue="$128K"
            centreLabel="this month"
            hole={0.5}
            categoryLabel="Plan"
            formatOptions={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
            table={table()}
            height={240}
          />
          <Text size="sm" color="muted">
            The theme's chart ramp, a centre value of its own and amounts in the locale.
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}
