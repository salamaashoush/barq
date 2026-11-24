import { createSignal } from "@barqjs/core";
import { Grid, PersonAvatar, Stack, Switch, Label, Inline, Text, Timeline } from "@barqjs/arc";
import { GitCommitHorizontal } from "@barqjs/lucide/icons/git-commit-horizontal";
import { Rocket } from "@barqjs/lucide/icons/rocket";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";

import { ACTIVITY, NOW } from "../../data/operations.ts";

export default function TimelineExample() {
  const [absolute, setAbsolute] = createSignal(false);

  return (
    <Stack gap={4}>
      <Inline gap={2} align="center">
        <Switch id="timeline-absolute" isSelected={absolute()} onChange={setAbsolute} />
        <Label for="timeline-absolute">Absolute times</Label>
      </Inline>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
        <Timeline
          aria-label="Workspace activity"
          now={NOW}
          timeFormat={absolute() ? "absolute" : "relative"}
          events={ACTIVITY.map((event) => ({
            id: event.id,
            title: event.what,
            description: event.detail,
            time: event.at,
            tone: event.tone,
            actor: <PersonAvatar person={{ name: event.who }} size="sm" />,
          }))}
        />
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Compact, with icons for markers
          </Text>
          <Timeline
            aria-label="Release v2.4.1"
            density="compact"
            now={NOW}
            timeFormat={absolute() ? "absolute" : "relative"}
            events={[
              {
                id: "r1",
                title: "Released to production",
                icon: <Rocket />,
                tone: "success",
                time: "2026-11-24T08:52:00Z",
              },
              {
                id: "r2",
                title: "Canary error rate above 2%",
                icon: <TriangleAlert />,
                tone: "warning",
                time: "2026-11-24T08:31:00Z",
              },
              {
                id: "r3",
                title: "Merged 14 commits",
                icon: <GitCommitHorizontal />,
                time: "2026-11-24T08:02:00Z",
              },
            ]}
          />
        </Stack>
      </Grid>
    </Stack>
  );
}
