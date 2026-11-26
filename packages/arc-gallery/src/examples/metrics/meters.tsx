import { createSignal } from "@barqjs/core";
import { Grid, Meter, Slider, Stack, UsageList } from "@barqjs/arc";

export default function Meters() {
  const [minutes, setMinutes] = createSignal(412);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={8}>
      <Stack gap={5}>
        <Meter
          label="Browser minutes"
          value={minutes()}
          maxValue={500}
          thresholds={[
            { value: 400, tone: "warning" },
            { value: 500, tone: "danger" },
          ]}
        />
        <Slider
          label="Minutes used"
          value={minutes()}
          onChange={setMinutes}
          minValue={0}
          maxValue={560}
        />
        <Meter
          label="Storage"
          value={3.2}
          maxValue={10}
          valueLabel="3.2 GB of 10 GB"
          size="lg"
          tone="success"
        />
        <Meter label="Sessions at once" value={3} maxValue={5} size="sm" />
      </Stack>
      <UsageList
        aria-label="Usage this month"
        items={[
          {
            key: "minutes",
            label: "Browser minutes",
            used: minutes(),
            limit: 500,
            description: "Resets on 1 December",
          },
          { key: "seats", label: "Seats", used: 10, limit: 10 },
          {
            key: "spend",
            label: "Spend",
            used: 2.4,
            limit: 2,
            formatOptions: { style: "currency", currency: "USD" },
          },
          { key: "checks", label: "Checks", used: 38, limit: null },
        ]}
      />
    </Grid>
  );
}
