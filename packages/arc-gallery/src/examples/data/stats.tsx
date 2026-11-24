import { Grid, StatCard, StatGroup, Stack, Text } from "@barqjs/arc";

import { DAYS } from "../../data/operations.ts";

const requests = DAYS.map((day) => day.requests);
const latency = DAYS.map((day) => day.latency);
const errors = DAYS.map((day) => day.errors);

export default function Stats() {
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          StatGroup, joined
        </Text>
        <StatGroup
          aria-label="This week"
          stats={[
            {
              label: "Monthly revenue",
              value: "$84,210",
              delta: { value: "+12.4%", tone: "success", direction: "up", label: "from October" },
            },
            {
              label: "Active customers",
              value: "1,284",
              delta: { value: "+38", tone: "success", direction: "up", label: "this week" },
            },
            {
              label: "Churn",
              value: "1.9%",
              delta: { value: "+0.3 pts", tone: "danger", direction: "up", label: "from October" },
            },
            {
              label: "Open tickets",
              value: "42",
              delta: { value: "No change", direction: "flat" },
            },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          StatGroup, separate cards with trends
        </Text>
        <StatGroup
          aria-label="API health"
          variant="separate"
          columns={3}
          stats={[
            {
              label: "Requests",
              value: "249K",
              trend: requests,
              delta: { value: "+56%", tone: "success", direction: "up", label: "from yesterday" },
            },
            {
              label: "p95 latency",
              value: "189 ms",
              trend: latency,
              trendTone: "warning",
              delta: { value: "-11%", tone: "success", direction: "down", label: "from last week" },
            },
            {
              label: "Error rate",
              value: "1.4%",
              trend: errors,
              trendTone: "danger",
              description: "Below the 2% budget",
            },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          StatCard on its own
        </Text>
        <Grid columns={{ base: 1, cqMd: 2 }} gap={4}>
          <StatCard
            label="Uptime, 30 days"
            value="99.98%"
            description="Two incidents, 9 minutes in total"
          />
          <StatCard
            label="Failed payments"
            value="17"
            delta={{ value: "+5", tone: "danger", direction: "up", label: "since Monday" }}
            trend={[4, 3, 6, 2, 9, 12, 17]}
            trendLabel="Failed payments rose from 4 to 17 over the week"
          />
        </Grid>
      </Stack>
    </Stack>
  );
}
