import { For, createSignal } from "@barqjs/core";
import {
  AvatarStack,
  Inline,
  PersonAvatar,
  type Presence,
  PresenceDot,
  PresenceStatus,
  Stack,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/arc";

import { NOW } from "../../data/operations.ts";

const TEAM = [
  { id: "salama", name: "Salama", presence: "online" as const },
  { id: "lina", name: "Lina", src: "/media/harbour.svg", presence: "away" as const },
  { id: "omar", name: "Omar", presence: "dnd" as const },
  { id: "maya", name: "Maya", src: "/media/forest.svg", presence: "online" as const },
  { id: "jonas", name: "Jonas", presence: "offline" as const },
  { id: "nour", name: "Nour", presence: "online" as const },
  { id: "karim", name: "Karim", presence: "away" as const },
];

interface PresenceOption {
  value: Presence;
  label: string;
}

const PRESENCES: readonly PresenceOption[] = [
  { value: "online", label: "Online" },
  { value: "away", label: "Away" },
  { value: "dnd", label: "Do not disturb" },
  { value: "offline", label: "Offline" },
];

export default function People() {
  const [mine, setMine] = createSignal<Presence>("online");

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          AvatarStack in three sizes, four shown and the rest counted
        </Text>
        <Inline gap={6} align="center" wrap>
          <AvatarStack people={TEAM} size="sm" />
          <AvatarStack people={TEAM} />
          <AvatarStack people={TEAM.slice(0, 3)} size="lg" max={3} />
        </Inline>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          PersonAvatar, a photo, initials, and a photo that fails to load
        </Text>
        <Inline gap={3} align="center">
          <PersonAvatar person={{ name: "Lina", src: "/media/harbour.svg" }} size="lg" />
          <PersonAvatar person={{ name: "Salama" }} size="lg">
            <PresenceDot presence={mine()} anchored />
          </PersonAvatar>
          <PersonAvatar person={{ name: "Omar Haddad", src: "/media/missing.png" }} size="lg" />
        </Inline>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          PresenceDot and PresenceStatus
        </Text>
        <ToggleGroup
          aria-label="Your presence"
          variant="outline"
          size="sm"
          value={mine()}
          onChange={(value) => {
            const next = PRESENCES.find((each) => each.value === value[0]);
            if (next !== undefined) setMine(next.value);
          }}
        >
          <For each={PRESENCES}>
            {(each) => <ToggleGroupItem value={each.value}>{each.label}</ToggleGroupItem>}
          </For>
        </ToggleGroup>
        <Inline gap={4} align="center" wrap>
          <For each={PRESENCES}>{(each) => <PresenceDot presence={each.value} />}</For>
        </Inline>
        <PresenceStatus presence={mine()} />
        <PresenceStatus
          presence="dnd"
          status={{
            emoji: "🎧",
            text: "Focusing on the Q4 roadmap",
            expiresAt: "2026-11-24T12:00:00Z",
          }}
          now={NOW}
          timeZone="UTC"
        />
        <PresenceStatus
          presence="away"
          status={{ emoji: "🌴", text: "On leave until Monday" }}
          compact
        />
      </Stack>
    </Stack>
  );
}
