import { createSignal } from "@barqjs/core";
import {
  ColorField,
  ColorPicker,
  Grid,
  type NumberPair,
  OptionalLimitField,
  PairedNumberField,
  Stack,
  Text,
} from "@barqjs/arc";

const ON_ACCENT = [
  { color: "#ffffff", label: "white text" },
  { color: "#0a0a0a", label: "the dark page", minimum: 3 },
];

export default function Limits() {
  const [offline, setOffline] = createSignal<number | null>(10);
  const [jobs, setJobs] = createSignal<number | null>(null);
  const [spend, setSpend] = createSignal<number | null>(null);
  const [viewport, setViewport] = createSignal<NumberPair | null>([1280, 720]);
  return (
    <Stack gap={8}>
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <OptionalLimitField
          label="Offline alert"
          amountLabel="Minutes"
          sentence={(amount) => `Alert when no runner is online for ${amount} minutes`}
          minValue={1}
          value={offline()}
          onChange={setOffline}
        />
        <OptionalLimitField
          label="Concurrency"
          amountLabel="Jobs at once"
          sentence={(amount) => `Run at most ${amount} jobs at once`}
          defaultAmount={4}
          minValue={1}
          maxValue={64}
          value={jobs()}
          onChange={setJobs}
        />
        <OptionalLimitField
          label="Spend limit"
          mode="blank"
          amountLabel="Dollars a month"
          sentence={(amount) => `Stop runs once the month reaches ${amount}`}
          formatOptions={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
          value={spend()}
          onChange={setSpend}
        />
        <OptionalLimitField
          label="Retention"
          amountLabel="Days"
          sentence={(amount) => `Delete runs older than ${amount} days`}
          defaultValue={30}
          isDisabled
          description="Your plan keeps runs for 30 days."
        />
      </Grid>
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <PairedNumberField
          label="Viewport"
          labels={["Width", "Height"]}
          unit="pixels; overrides the device"
          minValue={1}
          value={viewport()}
          onChange={setViewport}
        />
        <PairedNumberField
          label="Location"
          labels={["Latitude", "Longitude"]}
          separator=","
          placeholders={["30.04", "31.24"]}
          minValue={-180}
          maxValue={180}
          step={0.0001}
          description="Leave both empty to use the runner's own."
        />
      </Grid>
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <ColorField label="Accent" defaultValue="#3b82f6" contrastWith={ON_ACCENT} />
        <ColorPicker label="Brand" defaultValue="#facc15" contrastWith={ON_ACCENT} />
      </Grid>
      <Text size="xs" color="muted">
        Offline alert {offline() ?? "off"}; jobs {jobs() ?? "unlimited"}; spend{" "}
        {spend() ?? "no limit"}; viewport {viewport()?.join(" × ") ?? "from the device"}.
      </Text>
    </Stack>
  );
}
