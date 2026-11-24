import { createSignal } from "@barqjs/core";
import { Grid, PhoneField, Stack, Text } from "@barqjs/arc";

export default function Phones() {
  const [phone, setPhone] = createSignal<string | null>("+201001234567");
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <Stack gap={1}>
        <PhoneField label="Mobile" value={phone()} onChange={setPhone} />
        <Text size="xs" color="muted" mono>
          Stored as {phone() ?? "nothing"}
        </Text>
      </Stack>
      <PhoneField
        label="Office"
        description="Offices in the Gulf only."
        defaultCountry="AE"
        countries={["AE", "SA", "QA", "KW", "BH", "OM"]}
      />
      <PhoneField label="Support line" defaultCountry="DE" placeholder="030 1234567" />
      <PhoneField label="Fax" defaultValue="+14155550132" isDisabled />
      <PhoneField
        label="Emergency contact"
        isRequired
        isInvalid
        errorMessage="Add a number we can reach."
      />
    </Grid>
  );
}
