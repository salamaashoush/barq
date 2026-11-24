import { createSignal } from "@barqjs/core";
import { Gauge, Grid, Slider, Stack, Text } from "@barqjs/arc";

const THRESHOLDS = [
  { value: 0, tone: "success" as const },
  { value: 70, tone: "warning" as const },
  { value: 90, tone: "danger" as const },
];

export default function GaugeExample() {
  const [storage, setStorage] = createSignal(64);

  return (
    <Stack gap={6}>
      <Grid columns={{ base: 1, cqSm: 3 }} gap={6}>
        <Gauge
          label="Storage used"
          value={storage()}
          thresholds={THRESHOLDS}
          formatOptions={{ style: "unit", unit: "percent" }}
          height={160}
        />
        <Gauge
          label="Seats taken"
          value={42}
          maxValue={50}
          valueLabel="42 of 50 seats"
          tone="info"
          height={160}
        />
        <Gauge
          label="p95 latency"
          value={189}
          minValue={0}
          maxValue={400}
          thresholds={[
            { value: 0, tone: "success" },
            { value: 250, tone: "warning" },
            { value: 350, tone: "danger" },
          ]}
          formatOptions={{ style: "unit", unit: "millisecond" }}
          height={160}
        />
      </Grid>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Drag to fill the storage: it turns to a warning at 70% and to danger at 90%.
        </Text>
        <Slider
          aria-label="Storage used"
          minValue={0}
          maxValue={100}
          value={[storage()]}
          onChange={(value: number[]) => setStorage(value[0] ?? 0)}
        />
      </Stack>
    </Stack>
  );
}
