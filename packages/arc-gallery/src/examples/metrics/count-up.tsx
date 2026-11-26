import { For } from "@barqjs/core";
import { CountUp, Grid, StatCard } from "@barqjs/arc";

interface Figure {
  label: string;
  value: number;
  options?: Intl.NumberFormatOptions;
}

const FIGURES: readonly Figure[] = [
  { label: "Students", value: 1280 },
  { label: "Pass rate", value: 0.982, options: { style: "percent", maximumFractionDigits: 1 } },
  {
    label: "Raised for the library",
    value: 48250,
    options: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  },
];

export default function CountUpExample() {
  return (
    <Grid columns={{ base: 1, cqSm: 3 }} gap={4}>
      <For each={FIGURES}>
        {(figure: Figure) => (
          <StatCard
            label={figure.label}
            value={<CountUp value={figure.value} formatOptions={figure.options} />}
          />
        )}
      </For>
    </Grid>
  );
}
