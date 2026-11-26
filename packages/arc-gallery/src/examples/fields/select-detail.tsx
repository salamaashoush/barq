import { Grid, Text, type FieldOption, useArcForm } from "@barqjs/arc";

const THROTTLES: FieldOption[] = [
  { value: "fast-3g", label: "Fast 3G", hint: "150 ms, 1.6 Mbit/s" },
  { value: "slow-3g", label: "Slow 3G", hint: "2 s, 400 kbit/s" },
  { value: "offline", label: "Offline", hint: "No network" },
];

const RECORDS: FieldOption[] = [
  { value: "A", label: "A", hint: "IPv4 address", group: "Addresses" },
  { value: "AAAA", label: "AAAA", hint: "IPv6 address", group: "Addresses" },
  { value: "MX", label: "MX", hint: "Mail servers", group: "Mail" },
  { value: "TXT", label: "TXT", hint: "Text, such as SPF", group: "Mail" },
  { value: "CNAME", label: "CNAME", hint: "An alias", group: "Names" },
];

const TUNNELS: FieldOption[] = [
  { value: "office", label: "Office network" },
  { value: "lab", label: "Lab (no agent connected)", isDisabled: true },
];

interface NetworkValues {
  throttle: string | null;
  record: string | null;
  tunnel: string | null;
}

export default function SelectDetail() {
  const defaults: NetworkValues = { throttle: null, record: "MX", tunnel: "vpn-old" };
  const form = useArcForm(() => ({ defaultValues: defaults }));
  const values = form.useSelector((state) => state.values);
  return (
    <form.AppForm>
      <Grid columns={{ base: 1, md: 3 }} gap={6}>
        <form.AppField name="throttle">
          {(field) => (
            <field.SelectField
              label="Network"
              options={THROTTLES}
              noneLabel="None, use the network"
            />
          )}
        </form.AppField>
        <form.AppField name="record">
          {(field) => <field.SelectField label="Record type" options={RECORDS} />}
        </form.AppField>
        <form.AppField name="tunnel">
          {(field) => (
            <field.SelectField
              label="Tunnel"
              options={TUNNELS}
              unknownLabel={(value) => `${value} (removed)`}
              description="A tunnel removed since keeps its place."
            />
          )}
        </form.AppField>
      </Grid>
      <Text size="xs" color="muted">
        {JSON.stringify(values())}
      </Text>
    </form.AppForm>
  );
}
