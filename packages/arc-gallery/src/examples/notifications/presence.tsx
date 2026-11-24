import { For, Show, createSignal } from "@barqjs/core";
import {
  Button,
  Inline,
  type Presence,
  PresenceDot,
  PresenceProvider,
  PresenceStatus,
  PersonAvatar,
  Stack,
  Text,
  createPresenceStore,
  usePresence,
  useTyping,
} from "@barqjs/arc";
import { gap, layout, space, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const demo = layer("demo");
const row = demo(layout.row, gap[3], { paddingBlock: space.x2 });
const list = demo(surface.card, layout.column, { paddingInline: space.x4, paddingBlock: space.x2 });

const HOUR = 3_600_000;
const PEOPLE = [
  { id: "salama", name: "Salama" },
  { id: "lina", name: "Lina" },
  { id: "omar", name: "Omar" },
  { id: "maya", name: "Maya" },
];
const CYCLE: readonly Presence[] = ["online", "away", "dnd", "offline"];

function Member(props: { id: string; name: string }) {
  const entry = usePresence(() => props.id);
  return (
    <div class={row}>
      <PersonAvatar person={{ name: props.name }}>
        <PresenceDot presence={entry().presence} anchored />
      </PersonAvatar>
      <Stack gap={0.5}>
        <Text weight="medium">{props.name}</Text>
        <PresenceStatus presence={entry().presence} status={entry().status} />
      </Stack>
    </div>
  );
}

function Typing() {
  const typing = useTyping(() => "design");
  const names = () => typing().map((id) => PEOPLE.find((person) => person.id === id)?.name ?? id);
  return (
    <div role="status">
      <Text size="sm" color="muted">
        <Show when={names().length > 0} fallback="Nobody is typing in #design">
          {new Intl.ListFormat("en", { type: "conjunction" }).format(names())} typing in #design
        </Show>
      </Text>
    </div>
  );
}

export default function PresenceExample() {
  const nextHour = Math.ceil(Date.now() / HOUR) * HOUR + HOUR;
  const store = createPresenceStore({
    initial: {
      salama: { presence: "online", status: { emoji: "🚀", text: "Shipping the billing revamp" } },
      lina: { presence: "away", status: { emoji: "🍽️", text: "Lunch", expiresAt: nextHour } },
      omar: { presence: "dnd", status: { emoji: "🎧", text: "Focusing" } },
      maya: { presence: "offline" },
    },
    typingTimeout: 4000,
  });
  const [lina, setLina] = createSignal(1);

  return (
    <PresenceProvider store={store}>
      <Stack gap={4}>
        <Inline gap={2} wrap>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              const next = (lina() + 1) % CYCLE.length;
              setLina(next);
              store.apply({ type: "presence", userId: "lina", presence: CYCLE[next] ?? "online" });
            }}
          >
            Change Lina's presence
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              store.apply({
                type: "presence",
                userId: "maya",
                presence: "online",
                status: { emoji: "☕", text: "Back in 10 seconds", expiresAt: Date.now() + 10_000 },
              })
            }
          >
            Maya sets a 10 second status
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              store.apply({
                type: "typing",
                userId: "omar",
                conversationId: "design",
                typing: true,
              })
            }
          >
            Omar types
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              store.apply({
                type: "typing",
                userId: "salama",
                conversationId: "design",
                typing: true,
              })
            }
          >
            Salama types
          </Button>
        </Inline>
        <div class={list}>
          <For each={PEOPLE}>{(person) => <Member id={person.id} name={person.name} />}</For>
        </div>
        <Typing />
        <Inline gap={4} wrap>
          <For each={CYCLE}>{(presence) => <PresenceStatus presence={presence} />}</For>
        </Inline>
      </Stack>
    </PresenceProvider>
  );
}
