import { createSignal } from "@barqjs/core";
import { Grid, Text, TimeField, TimePicker } from "@barqjs/arc";
import { Time } from "@barqjs/aria/date";

export default function Times() {
  const [meeting, setMeeting] = createSignal<Time | null>(new Time(9, 30));
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <TimeField
        label="Reminder"
        description={`Set to ${meeting()?.toString() ?? "nothing"}`}
        value={meeting()}
        onChange={setMeeting}
      />
      <TimePicker
        label="Stand-up"
        description="Office hours, every 15 minutes."
        value={meeting()}
        onChange={setMeeting}
        step={15}
        minValue={new Time(8)}
        maxValue={new Time(18)}
      />
      <TimeField label="Deploy window, 24 hours" defaultValue={new Time(22, 0)} hourCycle={24} />
      <TimeField
        label="Race split"
        granularity="second"
        defaultValue={new Time(0, 4, 32)}
        hourCycle={24}
      />
      <TimePicker
        label="Delivery slot"
        times={[new Time(9), new Time(12), new Time(15), new Time(18)]}
        defaultValue={new Time(12)}
      />
      <TimeField label="Cut-off" defaultValue={new Time(17)} isDisabled />
      <TimeField
        label="Check-in"
        isRequired
        isInvalid
        errorMessage="Check-in opens at 14:00."
        defaultValue={new Time(11)}
      />
      <Text size="xs" color="muted">
        The fields follow the locale's hour cycle until hourCycle says otherwise.
      </Text>
    </Grid>
  );
}
