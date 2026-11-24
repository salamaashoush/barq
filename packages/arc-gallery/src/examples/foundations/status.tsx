import { For, createSignal } from "@barqjs/core";
import {
  Avatar,
  AvatarFallback,
  Button,
  Grid,
  Indicator,
  Inline,
  Stack,
  Status,
  TONES,
  Text,
} from "@barqjs/arc";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Inbox } from "@barqjs/lucide/icons/inbox";

const WORDS = {
  success: "Operational",
  warning: "Degraded",
  danger: "Outage",
  info: "Maintenance",
  neutral: "Paused",
} as const;

export default function StatusAndIndicator() {
  const [unread, setUnread] = createSignal(3);
  return (
    <Stack gap={6}>
      <Grid columns={{ base: 1, cqMd: 3 }} gap={4}>
        <Stack gap={2}>
          <Text size="xs" color="muted">
            dot
          </Text>
          <For each={TONES}>{(tone) => <Status tone={tone}>{WORDS[tone]}</Status>}</For>
        </Stack>
        <Stack gap={2} align="start">
          <Text size="xs" color="muted">
            subtle
          </Text>
          <For each={TONES}>
            {(tone) => (
              <Status tone={tone} variant="subtle">
                {WORDS[tone]}
              </Status>
            )}
          </For>
        </Stack>
        <Stack gap={2} align="start">
          <Text size="xs" color="muted">
            solid
          </Text>
          <For each={TONES}>
            {(tone) => (
              <Status tone={tone} variant="solid">
                {WORDS[tone]}
              </Status>
            )}
          </For>
        </Stack>
      </Grid>
      <Status tone="success" pulse>
        Live, 1,204 viewers
      </Status>

      <Stack gap={3}>
        <Inline gap={6} align="center" wrap>
          <Indicator count={unread()} tone="danger">
            <Bell aria-label="Notifications" />
          </Indicator>
          <Indicator count={128} tone="info" label="128 unread messages">
            <Inbox aria-label="Inbox" />
          </Indicator>
          <Indicator dot tone="success">
            <Avatar>
              <AvatarFallback>SA</AvatarFallback>
            </Avatar>
          </Indicator>
          <Indicator count={0} showZero variant="subtle" />
          <Indicator count={7} size="sm" tone="warning" variant="subtle" />
          <Indicator count={1500} max={999} />
        </Inline>
        <Inline gap={2}>
          <Button size="sm" variant="outline" onPress={() => setUnread(unread() + 1)}>
            New notification
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setUnread(0)}>
            Mark all read
          </Button>
        </Inline>
      </Stack>
    </Stack>
  );
}
