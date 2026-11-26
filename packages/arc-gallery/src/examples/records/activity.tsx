import { createSignal } from "@barqjs/core";
import {
  IconButton,
  Link,
  PersonAvatar,
  Stack,
  Text,
  Timeline,
  type TimelineEvent,
  type TimelineKind,
} from "@barqjs/arc";
import { BellRing } from "@barqjs/lucide/icons/bell-ring";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Hand } from "@barqjs/lucide/icons/hand";
import { MapPin } from "@barqjs/lucide/icons/map-pin";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { SquareTerminal } from "@barqjs/lucide/icons/square-terminal";

import { NOW } from "./data.ts";

const KINDS: Record<string, TimelineKind> = {
  opened: {
    label: "Opened",
    icon: <CircleAlert />,
    tone: "danger",
    verb: () => "opened the incident",
  },
  location_failing: {
    label: "Locations",
    icon: <MapPin />,
    tone: "danger",
    verb: () => "saw another location start failing",
  },
  paged: { label: "Pages", icon: <BellRing />, verb: () => "paged the on-call engineer" },
  acknowledged: {
    label: "Acknowledged",
    icon: <Hand />,
    tone: "warning",
    verb: () => "acknowledged",
  },
  renamed: {
    label: "Renames",
    icon: <Pencil />,
    verb: (event) =>
      `renamed the incident to ${typeof event.description === "string" ? event.description : ""}`,
    quiet: true,
  },
  comment: { label: "Comments", icon: <MessageSquare />, verb: () => "commented", comment: true },
  resolved: { label: "Resolved", icon: <CircleCheck />, tone: "success", verb: () => "resolved" },
};

interface WhoProps {
  name: string;
}

function Who(props: WhoProps) {
  return (
    <>
      <PersonAvatar size="sm" person={{ name: props.name }} />
      {props.name}
    </>
  );
}

const EVENTS: TimelineEvent[] = [
  {
    id: "e8",
    kind: "resolved",
    actor: <Who name="Ana Lima" />,
    time: "2026-03-04T10:42:00.000Z",
    isKey: true,
  },
  {
    id: "e7",
    kind: "comment",
    actor: <Who name="Salama Ashoush" />,
    time: "2026-03-04T10:30:00.000Z",
    description:
      "Rolled back the payments deploy. Error rates are back under 0.1%.\nWatching it for another hour before closing.",
  },
  {
    id: "e6",
    kind: "renamed",
    actor: <Who name="Ben Okafor" />,
    time: "2026-03-04T09:05:00.000Z",
    description: "Checkout fails in eu-west",
  },
  {
    id: "e5",
    kind: "acknowledged",
    actor: <Who name="Ben Okafor" />,
    time: "2026-03-03T23:58:00.000Z",
    isKey: true,
  },
  { id: "e4", kind: "paged", time: "2026-03-03T23:51:00.000Z", actor: "acme monitor" },
  {
    id: "e3",
    kind: "location_failing",
    time: "2026-03-03T23:50:00.000Z",
    actor: "acme monitor",
    action: (
      <IconButton label="Open the run's console" size="xs" href="/code#console-log">
        <SquareTerminal />
      </IconButton>
    ),
  },
  {
    id: "e2",
    kind: "opened",
    time: "2026-03-03T23:49:00.000Z",
    actor: "acme monitor",
    isKey: true,
    action: <Link href="#run-2209">View run</Link>,
  },
  { id: "e1", kind: "page_failed", time: "2026-02-27T08:00:00.000Z", actor: "acme monitor" },
];

export default function ActivityExample() {
  const [events, setEvents] = createSignal(EVENTS);
  const [loading, setLoading] = createSignal(false);
  return (
    <Stack gap={8}>
      <Timeline
        aria-label="Incident timeline"
        groupByDay
        filterable
        timeFormat="absolute"
        timeZone="UTC"
        now={NOW}
        kinds={KINDS}
        events={events()}
        onKeyChange={(id, isKey) =>
          setEvents(events().map((event) => (event.id === id ? { ...event, isKey } : event)))
        }
        isLoadingMore={loading()}
        onLoadMore={() => {
          setLoading(true);
          setTimeout(() => setLoading(false), 800);
        }}
      />
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Compact, absolute times, nothing yet
        </Text>
        <Timeline
          density="compact"
          timeFormat="absolute"
          events={[]}
          empty="Nothing has happened to this record yet."
        />
      </Stack>
    </Stack>
  );
}
