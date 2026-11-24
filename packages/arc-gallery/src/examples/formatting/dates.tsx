import { Show, createSignal } from "@barqjs/core";
import {
  Button,
  DescriptionList,
  FormattedDate,
  Inline,
  RelativeTime,
  Stack,
  Text,
} from "@barqjs/arc";

const CREATED = "2026-03-14T09:30:00Z";
const RELEASED = "2026-11-20T16:45:00Z";
const RENEWS = "2027-01-01T00:00:00Z";

export default function Dates() {
  const [savedAt, setSavedAt] = createSignal<number | null>(null);
  return (
    <Stack gap={4}>
      <DescriptionList
        columns={2}
        items={[
          { term: "Medium, the default", details: <FormattedDate value={CREATED} /> },
          {
            term: "Full",
            details: <FormattedDate value={CREATED} options={{ dateStyle: "full" }} />,
          },
          {
            term: "Date and time in Cairo",
            details: (
              <FormattedDate
                value={RELEASED}
                options={{ dateStyle: "medium", timeStyle: "short" }}
                timeZone="Africa/Cairo"
              />
            ),
          },
          {
            term: "Time in Berlin",
            details: (
              <FormattedDate
                value={RELEASED}
                options={{ timeStyle: "short" }}
                timeZone="Europe/Berlin"
              />
            ),
          },
          {
            term: "Month and year",
            details: <FormattedDate value={RENEWS} options={{ month: "long", year: "numeric" }} />,
          },
          { term: "Released", details: <RelativeTime value={RELEASED} /> },
          { term: "Renews", details: <RelativeTime value={RENEWS} wording="always" /> },
          { term: "Created, short", details: <RelativeTime value={CREATED} length="short" /> },
          { term: "Created, narrow", details: <RelativeTime value={CREATED} length="narrow" /> },
        ]}
      />
      <Inline gap={3} align="center" wrap>
        <Button variant="outline" size="sm" onPress={() => setSavedAt(Date.now())}>
          Save draft
        </Button>
        <Show when={savedAt()} fallback={<Text color="muted">Not saved yet</Text>}>
          {(at) => (
            <Text color="muted">
              Saved <RelativeTime value={at()} />, and it keeps counting
            </Text>
          )}
        </Show>
      </Inline>
    </Stack>
  );
}
