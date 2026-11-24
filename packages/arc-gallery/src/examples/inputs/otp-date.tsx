import { createSignal } from "@barqjs/core";
import {
  DatePicker,
  Field,
  FieldDescription,
  FieldLabel,
  Grid,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Stack,
  Text,
} from "@barqjs/arc";
import { type CalendarDate, getLocalTimeZone, today } from "@barqjs/aria/date";

export default function OtpAndDate() {
  const [code, setCode] = createSignal("");
  const [due, setDue] = createSignal<CalendarDate | null>(null);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={8}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Verification code
          </Text>
          <InputOTP maxLength={6} aria-label="Verification code" value={code()} onChange={setCode}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <Text size="xs" color="muted">
            {code().length === 6
              ? `Checking ${code()}…`
              : `Sent to salama@example.com. ${String(6 - code().length)} digits to go.`}
          </Text>
        </Stack>
        <InputOTP maxLength={4} aria-label="Disabled code" disabled value="2048">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      </Stack>
      <Stack gap={4}>
        <Field>
          <FieldLabel>Invoice due</FieldLabel>
          <DatePicker
            value={due()}
            onChange={setDue}
            minValue={today(getLocalTimeZone())}
            presets={[
              { label: "In a week", value: 7 },
              { label: "In 30 days", value: 30 },
            ]}
            closeOnSelect
          />
          <FieldDescription>
            {due() === null ? "No date yet." : `Due ${due()?.toString() ?? ""}`}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Date of birth</FieldLabel>
          <DatePicker captionLayout="dropdown" placeholder="Pick your birthday" />
        </Field>
        <Field>
          <FieldLabel>Contract start</FieldLabel>
          <DatePicker isDisabled placeholder="Locked by legal" />
        </Field>
      </Stack>
    </Grid>
  );
}
