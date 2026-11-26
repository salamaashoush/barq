import { Stack, UptimeBar } from "@barqjs/arc";

import { ninetyDays } from "./data.ts";

export default function Uptime() {
  return (
    <Stack gap={6}>
      <UptimeBar label="API" cells={ninetyDays(3)} startLabel="90 days ago" endLabel="Today" />
      <UptimeBar
        label="Dashboard"
        cells={ninetyDays(7)}
        startLabel="90 days ago"
        endLabel="Today"
        legend
      />
      <UptimeBar
        label="Last 20 runs"
        size="sm"
        showSummary={false}
        stateLabels={{ up: "Passed", degraded: "Degraded", down: "Failed" }}
        cells={Array.from({ length: 20 }, (_, at) => ({
          key: String(at),
          label: `Run ${String(at + 1)}`,
          state:
            at === 6 || at === 15
              ? ("down" as const)
              : at === 11
                ? ("degraded" as const)
                : ("up" as const),
        }))}
      />
    </Stack>
  );
}
