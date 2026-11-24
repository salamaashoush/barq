import { createSignal } from "@barqjs/core";
import {
  type DateRange,
  DateRangeField,
  Grid,
  Stack,
  Text,
  commonRangePresets,
  useArcMessages,
} from "@barqjs/arc";
import { getLocalTimeZone, today } from "@barqjs/aria/date";

export default function DateRanges() {
  const messages = useArcMessages();
  const [period, setPeriod] = createSignal<DateRange | null>(null);
  const now = today(getLocalTimeZone());
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <Stack gap={1}>
        <DateRangeField
          label="Report period"
          presets="common"
          value={period()}
          onChange={setPeriod}
        />
        <Text size="xs" color="muted">
          {period() === null
            ? "Every day"
            : `${period()?.start.toString()} to ${period()?.end.toString()}`}
        </Text>
      </Stack>
      <DateRangeField
        label="Billing cycle"
        description="Arc's common presets plus the year so far."
        presets={[
          ...commonRangePresets(messages()),
          { label: "Year to date", value: { start: now.set({ month: 1, day: 1 }), end: now } },
        ]}
        maxValue={now}
      />
      <DateRangeField
        label="Leave request"
        description="Weekends are not counted."
        minValue={now}
        numberOfMonths={1}
        isDateUnavailable={(date) => {
          const day = date.toDate(getLocalTimeZone()).getDay();
          return day === 0 || day === 6;
        }}
      />
      <DateRangeField label="Archived period" isDisabled />
      <DateRangeField
        label="Campaign"
        isRequired
        isInvalid
        errorMessage="Pick when the campaign runs."
      />
    </Grid>
  );
}
