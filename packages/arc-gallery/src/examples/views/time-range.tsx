import { createSignal } from "@barqjs/core";
import {
  type TimeRange,
  TimeRangePicker,
  Stack,
  Text,
  commonTimeRangePresets,
  resolveTimeRange,
  useArcMessages,
} from "@barqjs/arc";

import { NOW } from "../../data/operations.ts";

export default function TimeRangeExample() {
  const messages = useArcMessages();
  const [range, setRange] = createSignal<TimeRange>({ preset: "24h" });
  const [live, setLive] = createSignal(true);

  function covered(): string {
    const resolved = resolveTimeRange(range(), commonTimeRangePresets(messages()), Date.parse(NOW));
    if (resolved === undefined) return "";
    return `${resolved.start.toISOString().slice(0, 16)} to ${resolved.end.toISOString().slice(0, 16)} UTC`;
  }

  return (
    <Stack gap={4}>
      <Stack gap={1.5}>
        <TimeRangePicker
          value={range()}
          onChange={setRange}
          live={live()}
          onLiveChange={setLive}
          timeZone="UTC"
        />
        <Text size="sm" color="muted">
          {covered()}
          {live() && "preset" in range() ? ", following the clock" : ""}
        </Text>
      </Stack>
      <TimeRangePicker aria-label="Window, kept in the address" param="range" size="default" />
      <TimeRangePicker
        aria-label="Presets only"
        allowCustom={false}
        presets={[
          { value: "15m", label: "15 min", duration: 900_000 },
          { value: "1h", label: "1 hour", duration: 3_600_000 },
          { value: "6h", label: "6 hours", duration: 21_600_000 },
        ]}
      />
    </Stack>
  );
}
