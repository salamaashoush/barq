import { Inline, MetricRating, SignalMeter, Stack } from "@barqjs/arc";

export default function Signals() {
  return (
    <Stack gap={5}>
      <Inline gap={6}>
        <SignalMeter level="excellent" showLabel />
        <SignalMeter level="good" showLabel />
        <SignalMeter level="fair" showLabel />
        <SignalMeter level="poor" showLabel />
        <SignalMeter level="unknown" showLabel />
        <SignalMeter level="good" size="md" label="Network" />
      </Inline>
      <Inline gap={4}>
        <MetricRating rating="good" />
        <MetricRating rating="fair" />
        <MetricRating rating="poor" />
        <MetricRating rating="good" variant="subtle">
          Fast
        </MetricRating>
        <MetricRating rating="poor" variant="solid">
          Slow
        </MetricRating>
      </Inline>
    </Stack>
  );
}
