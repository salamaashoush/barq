import { createSignal } from "@barqjs/core";
import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Inline,
  SplitButton,
  Stack,
  Text,
} from "@barqjs/arc";
import { CalendarClock } from "@barqjs/lucide/icons/calendar-clock";
import { Save } from "@barqjs/lucide/icons/save";
import { Send } from "@barqjs/lucide/icons/send";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

export default function SplitButtons() {
  const [last, setLast] = createSignal("Nothing yet");
  const [publishing, setPublishing] = createSignal(false);
  const publish = (): void => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      setLast("Published release 2.4");
    }, 1200);
  };
  return (
    <Stack gap={5}>
      <Inline gap={3} wrap align="center">
        <SplitButton
          icon={<Send />}
          onPress={() => setLast("Sent now")}
          actions={[
            {
              id: "schedule",
              label: "Schedule for later",
              icon: <CalendarClock />,
              onAction: () => setLast("Scheduled for 09:00"),
            },
            {
              id: "draft",
              label: "Save as draft",
              icon: <Save />,
              onAction: () => setLast("Saved as a draft"),
            },
            {
              id: "discard",
              label: "Discard",
              icon: <Trash2 />,
              tone: "danger",
              onAction: () => setLast("Discarded"),
            },
          ]}
        >
          Send
        </SplitButton>
        <SplitButton
          variant="outline"
          size="sm"
          isPending={publishing()}
          onPress={publish}
          menuLabel="More ways to publish"
          actions={[
            { id: "beta", label: "Publish to beta", onAction: () => setLast("Published to beta") },
            { id: "rollback", label: "Roll back", isDisabled: true, onAction: () => undefined },
          ]}
        >
          Publish
        </SplitButton>
        <SplitButton isDisabled onPress={() => undefined} actions={[]}>
          Merge
        </SplitButton>
      </Inline>
      <Text size="sm" color="muted" aria-live="polite">
        {last()}
      </Text>
      <ButtonGroup aria-label="Pagination">
        <Button variant="outline">Previous</Button>
        <ButtonGroupText>Page 3 of 12</ButtonGroupText>
        <Button variant="outline">Next</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Merge strategy">
        <Button variant="secondary">Squash and merge</Button>
        <ButtonGroupSeparator />
        <Button variant="secondary">Rebase</Button>
      </ButtonGroup>
      <ButtonGroup orientation="vertical" aria-label="Zoom">
        <Button variant="outline" size="sm">
          Zoom in
        </Button>
        <Button variant="outline" size="sm">
          Zoom out
        </Button>
      </ButtonGroup>
    </Stack>
  );
}
