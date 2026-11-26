import { ComboChart, Stack } from "@barqjs/arc";

import { LATENCY, READING, RUNS } from "./data.ts";

export default function ChartMarks() {
  return (
    <Stack gap={10}>
      <ComboChart
        label="Response time, today"
        data={LATENCY}
        x="hour"
        height={240}
        lines={[
          { key: "p50", label: "p50" },
          { key: "p95", label: "p95", dashed: true, status: "outcome" },
        ]}
        statuses={{ failed: { label: "Failed run", tone: "danger" } }}
        references={[{ value: 800, label: "Degraded above 800 ms", tone: "warning" }]}
        yTicks="nice"
        yFormat="duration"
        formatOptions={{ style: "unit", unit: "millisecond" }}
        table="toggle"
      />
      <ComboChart
        label="Runs by outcome"
        data={RUNS}
        x="day"
        height={240}
        stacked
        bars={[
          { key: "passed", label: "Passed", tone: "success" },
          { key: "degraded", label: "Degraded", tone: "warning" },
          { key: "failed", label: "Failed", tone: "danger" },
        ]}
        yTicks="nice"
        yFormat="count"
        legend="filter"
      />
      <ComboChart
        label="Words read a minute"
        data={READING}
        x="week"
        height={240}
        points
        lines={[
          { key: "words", label: "Words a minute" },
          { key: "norm", label: "Year group norm", dashed: true, tone: "neutral" },
        ]}
        bands={[{ from: 60, to: 70, label: "Needs support", tone: "warning" }]}
        annotations={[
          { x: "W3", label: "Reading group started", series: "words" },
          { x: "W5", label: "Half-term break" },
        ]}
        yTicks={[0, 25, 50, 75, 100]}
      />
    </Stack>
  );
}
