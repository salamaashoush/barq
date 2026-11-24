import { createSignal } from "@barqjs/core";
import { ComboChart, Grid, Inline, Label, Stack, Switch } from "@barqjs/arc";

import { DAYS } from "../../data/operations.ts";

const RUNS = DAYS.map((day) => ({ day: day.day, requests: day.requests, errors: day.errors }));

const REGIONS = [
  { month: "Jul", europe: 41, americas: 32, asia: 12 },
  { month: "Aug", europe: 44, americas: 35, asia: 15 },
  { month: "Sep", europe: 47, americas: 33, asia: 19 },
  { month: "Oct", europe: 52, americas: 38, asia: 22 },
  { month: "Nov", europe: 58, americas: 41, asia: 27 },
];

export default function ComboChartExample() {
  const [stacked, setStacked] = createSignal(true);

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <ComboChart
        label="Requests and error rate, last 14 days"
        data={RUNS}
        x="day"
        xLabel="Day"
        bars={[{ key: "requests", label: "Requests (thousands)" }]}
        lines={[{ key: "errors", label: "Error rate (%)", tone: "danger" }]}
        dualAxis
        yLabel="Requests"
        y2Label="Error rate"
        table="toggle"
        height={280}
      />
      <Stack gap={3}>
        <Inline gap={2} align="center">
          <Switch id="combo-stacked" isSelected={stacked()} onChange={setStacked} />
          <Label for="combo-stacked">Stack the regions</Label>
        </Inline>
        <ComboChart
          label="Revenue by region, thousands of dollars"
          data={REGIONS}
          x="month"
          xLabel="Month"
          stacked={stacked()}
          bars={[
            { key: "europe", label: "Europe" },
            { key: "americas", label: "Americas" },
            { key: "asia", label: "Asia Pacific" },
          ]}
          formatOptions={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
          height={240}
        />
      </Stack>
    </Grid>
  );
}
