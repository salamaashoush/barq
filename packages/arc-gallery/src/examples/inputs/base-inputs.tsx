import { createSignal } from "@barqjs/core";
import {
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Grid,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Stack,
  Switch,
  Text,
} from "@barqjs/arc";

const TIME_ZONES = [
  "Africa/Cairo",
  "Asia/Dubai",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
];

export default function BaseInputs() {
  const [name, setName] = createSignal("Acme");
  const [alerts, setAlerts] = createSignal(true);
  const [volume, setVolume] = createSignal([60]);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <Field>
        <FieldLabel for="workspace-name">Workspace name</FieldLabel>
        <Input
          id="workspace-name"
          value={name()}
          onInput={(event) => setName((event.target as HTMLInputElement).value)}
        />
        <FieldDescription>Shown as acme.example.com/{name().toLowerCase() || "…"}</FieldDescription>
      </Field>
      <Field isInvalid>
        <FieldLabel for="billing-email">Billing email</FieldLabel>
        <Input id="billing-email" type="email" value="salama@" aria-invalid />
        <FieldError>Enter a full email address.</FieldError>
      </Field>
      <Field>
        <FieldLabel for="api-key">API key</FieldLabel>
        <Input id="api-key" value="sk_live_4f9a…" disabled />
      </Field>
      <Field>
        <FieldLabel for="role">Role</FieldLabel>
        <Select defaultValue="editor">
          <SelectTrigger id="role">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel for="time-zone">Time zone</FieldLabel>
        <Combobox items={TIME_ZONES}>
          <ComboboxInput id="time-zone" placeholder="Search time zones" />
          <ComboboxContent>
            <ComboboxEmpty>No time zone matches.</ComboboxEmpty>
            <ComboboxList>
              {(zone: string) => <ComboboxItem value={zone}>{zone}</ComboboxItem>}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
      <Stack gap={3}>
        <Field orientation="horizontal">
          <Checkbox id="terms" defaultChecked />
          <FieldLabel for="terms">Send me the monthly product update</FieldLabel>
        </Field>
        <Field orientation="horizontal" isInvalid>
          <Checkbox id="dpa" isInvalid />
          <FieldLabel for="dpa">I accept the data processing agreement</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="locked" checked="indeterminate" disabled />
          <FieldLabel for="locked">Some projects archived</FieldLabel>
        </Field>
      </Stack>
      <Stack gap={3}>
        <Field orientation="horizontal">
          <Switch id="alerts" checked={alerts()} onCheckedChange={setAlerts} />
          <FieldLabel for="alerts">Incident alerts {alerts() ? "on" : "off"}</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch id="digest" size="sm" />
          <FieldLabel for="digest">Weekly digest, small</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch id="sso" defaultChecked disabled />
          <FieldLabel for="sso">Single sign-on, managed by your admin</FieldLabel>
        </Field>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium" id="volume-label">
          Alert volume, {volume()[0]}%
        </Text>
        <Slider
          aria-labelledby="volume-label"
          value={volume()}
          onValueChange={setVolume}
          min={0}
          max={100}
          step={5}
        />
        <Slider aria-label="Disabled slider" defaultValue={[30]} disabled />
      </Stack>
    </Grid>
  );
}
