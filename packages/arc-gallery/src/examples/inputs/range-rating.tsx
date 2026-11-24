import { createSignal } from "@barqjs/core";
import { Grid, RangeSlider, Rating, Stack, Text, type Range } from "@barqjs/arc";

export default function RangeAndRating() {
  const [price, setPrice] = createSignal<Range>([40, 320]);
  const [stars, setStars] = createSignal<number | null>(4);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={8}>
      <Stack gap={6}>
        <RangeSlider
          label="Price"
          value={price()}
          onChange={setPrice}
          minValue={0}
          maxValue={500}
          step={10}
          minStepsBetweenThumbs={2}
          formatOptions={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
        />
        <Text size="xs" color="muted">
          Showing plans from {price()[0]} to {price()[1]} dollars.
        </Text>
        <RangeSlider
          label="Working hours"
          defaultValue={[9, 17]}
          minValue={0}
          maxValue={24}
          minimumLabel="Start"
          maximumLabel="End"
        />
        <RangeSlider label="Latency budget" defaultValue={[20, 80]} isDisabled />
        <RangeSlider
          label="Discount band"
          defaultValue={[60, 90]}
          formatOptions={{ style: "unit", unit: "percent" }}
          isInvalid
          errorMessage="Discounts above 50% need approval."
        />
      </Stack>
      <Stack gap={6}>
        <Rating
          label="How was the onboarding call?"
          value={stars()}
          onChange={setStars}
          allowClear
        />
        <Text size="xs" color="muted">
          {stars() === null
            ? "Not rated"
            : `${String(stars())} of 5. Press the same star again to clear.`}
        </Text>
        <Rating aria-label="Average rating" value={4.3} isReadOnly size="sm" />
        <Rating label="Ten-point score" max={10} defaultValue={7} size="sm" />
        <Rating label="Large" defaultValue={3} size="lg" />
        <Rating label="Disabled" defaultValue={2} isDisabled />
        <Rating
          label="Required"
          isRequired
          isInvalid
          errorMessage="Rate the call before you send."
        />
      </Stack>
    </Grid>
  );
}
