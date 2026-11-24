import { createSignal } from "@barqjs/core";
import { Currency, CurrencyField, Grid, PercentField, Stack, Text, UnitField } from "@barqjs/arc";

export default function NumberFields() {
  const [price, setPrice] = createSignal<number | null>(49);
  const [discount, setDiscount] = createSignal<number | null>(0.15);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <CurrencyField
        label="Seat price"
        description="Per seat, per month."
        currency="USD"
        value={price()}
        onChange={setPrice}
        minValue={0}
        step={1}
      />
      <PercentField
        label="Discount"
        value={discount()}
        onChange={setDiscount}
        minValue={0}
        maxValue={0.5}
        step={0.05}
      />
      <Stack gap={1}>
        <Text size="sm" color="muted">
          Each seat costs
        </Text>
        <Text size="lg" weight="strong">
          <Currency value={(price() ?? 0) * (1 - (discount() ?? 0))} currency="USD" />
        </Text>
      </Stack>
      <CurrencyField
        label="Budget in euros, by code"
        currency="EUR"
        currencyDisplay="code"
        defaultValue={12_500}
        hideSteppers
      />
      <CurrencyField
        label="Adjustment"
        currency="USD"
        currencySign="accounting"
        defaultValue={-250}
      />
      <PercentField label="Tax rate" fractionDigits={2} defaultValue={0.0725} />
      <UnitField label="Parcel weight" unit="kilogram" defaultValue={2.4} step={0.1} minValue={0} />
      <UnitField
        label="Storage quota"
        unit="gigabyte"
        unitDisplay="long"
        defaultValue={250}
        step={50}
      />
      <UnitField
        label="Timeout"
        unit="millisecond"
        defaultValue={45_000}
        maxValue={30_000}
        commitBehavior="validate"
        description="Typed past the limit, it is kept and marked invalid."
      />
      <UnitField label="Top speed" unit="kilometer-per-hour" defaultValue={120} isDisabled />
      <CurrencyField
        label="Deposit"
        currency="SAR"
        isRequired
        isInvalid
        errorMessage="Enter the deposit."
      />
    </Grid>
  );
}
