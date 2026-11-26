import { Stack, StatCard, StatGroup, Text, rateMetric } from "@barqjs/arc";

export default function StatCards() {
  return (
    <Stack gap={6}>
      <StatGroup
        aria-label="This term"
        stats={[
          {
            label: "Seats filled",
            value: "38",
            meter: { value: 38, max: 40, thresholds: [{ value: 36, tone: "warning" }] },
            description: "2 left before the waitlist",
            descriptionTone: "warning",
            href: "#seats",
          },
          {
            label: "Applications",
            value: "214",
            delta: { value: "+18%", tone: "success", direction: "up", label: "on last term" },
            href: "#applications",
          },
          {
            label: "Fees outstanding",
            value: "$12,480",
            valueTone: "danger",
            description: "9 families",
          },
        ]}
      />
      <Stack gap={2}>
        <Text weight="medium">Web vitals, rated</Text>
        <StatGroup
          aria-label="Web vitals"
          columns={4}
          stats={[
            { label: "LCP", value: "4.2 s", rating: rateMetric(4200, { good: 2500, poor: 4000 }) },
            { label: "FCP", value: "1.6 s", rating: rateMetric(1600, { good: 1800, poor: 3000 }) },
            { label: "CLS", value: "0.14", rating: rateMetric(0.14, { good: 0.1, poor: 0.25 }) },
            { label: "TTFB", value: "620 ms", rating: rateMetric(620, { good: 800, poor: 1800 }) },
            { label: "Requests", value: "48", description: "1.2 MB" },
          ]}
        />
      </Stack>
      <StatGroup
        aria-label="Loading"
        variant="separate"
        loading
        stats={[
          { label: "Runs", value: "", description: "today" },
          { label: "Failures", value: "" },
          { label: "Uptime", value: "" },
        ]}
      />
      <StatCard
        label="Turns used"
        value="12 of 40"
        meter={{ value: 12, max: 40, valueLabel: "12 of 40 turns" }}
        aside={
          <Text size="xs" color="muted">
            Budget
          </Text>
        }
      />
    </Stack>
  );
}
