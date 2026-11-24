import { For } from "@barqjs/core";
import { Grid, Inline, Sparkline, Stack, Text } from "@barqjs/arc";

import { DAYS } from "../../data/operations.ts";

const SERVICES = [
  { name: "api", values: [212, 204, 198, 231, 176, 169, 207, 268, 221, 201] },
  { name: "billing", values: [120, 118, 131, 126, 122, 140, 138, 129, 125, 121] },
  { name: "search", values: [88, 92, 96, 140, 180, 150, 110, 98, 94, 90] },
];

export default function SparklineExample() {
  return (
    <Stack gap={6}>
      <Grid columns={{ base: 1, cqMd: 3 }} gap={4}>
        <Stack gap={1}>
          <Text size="sm" color="muted">
            Line, requests
          </Text>
          <Sparkline data={DAYS.map((day) => day.requests)} />
        </Stack>
        <Stack gap={1}>
          <Text size="sm" color="muted">
            Area, latency in ms
          </Text>
          <Sparkline variant="area" tone="warning" data={DAYS.map((day) => day.latency)} />
        </Stack>
        <Stack gap={1}>
          <Text size="sm" color="muted">
            Bars, error rate
          </Text>
          <Sparkline
            variant="bar"
            tone="danger"
            data={DAYS.map((day) => day.errors)}
            formatOptions={{ style: "unit", unit: "percent", maximumFractionDigits: 1 }}
          />
        </Stack>
      </Grid>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          A column on one scale, so the spike in search reads as one
        </Text>
        <For each={SERVICES}>
          {(service) => (
            <Inline gap={3} align="center">
              <Text as="span" mono size="sm">
                {service.name}
              </Text>
              <Sparkline
                data={service.values}
                domain={[0, 280]}
                tone={service.name === "search" ? "danger" : "success"}
                label={`${service.name} p95 latency over ten minutes, between ${Math.min(...service.values)} and ${Math.max(...service.values)} ms`}
              />
            </Inline>
          )}
        </For>
      </Stack>
    </Stack>
  );
}
