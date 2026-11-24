import { createSignal } from "@barqjs/core";
import { Stack, Text, toast } from "@barqjs/arc";
import { type ConversationGroup, ConversationList } from "@barqjs/arc/chat";
import { surface, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { Megaphone } from "@barqjs/lucide/icons/megaphone";

const demo = layer("demo");
const sidebar = demo(surface.card, { padding: space.x2, maxWidth: "18rem" });

const GROUPS: ConversationGroup[] = [
  {
    id: "channels",
    label: "Channels",
    action: { label: "New channel", onPress: () => toast("New channel") },
    conversations: [
      { id: "design", name: "design", unread: 12, mentions: 2 },
      { id: "engineering", name: "engineering", unread: 3 },
      { id: "announcements", name: "announcements", icon: Megaphone, muted: true, unread: 8 },
      { id: "billing-revamp", name: "billing-revamp", private: true, draft: true },
      { id: "random", name: "random", muted: true },
    ],
  },
  {
    id: "direct",
    label: "Direct messages",
    action: { label: "New message", onPress: () => toast("New message") },
    conversations: [
      {
        id: "dm-lina",
        name: "Lina",
        kind: "direct",
        person: { name: "Lina", presence: "online" },
        unread: 1,
        mentions: 1,
      },
      { id: "dm-omar", name: "Omar", kind: "direct", person: { name: "Omar", presence: "away" } },
      {
        id: "dm-maya",
        name: "Maya",
        kind: "direct",
        person: { name: "Maya", presence: "dnd" },
        draft: true,
      },
      {
        id: "dm-jonas",
        name: "Jonas",
        kind: "direct",
        person: { name: "Jonas", presence: "offline" },
      },
      { id: "group-launch", name: "Lina, Omar, Nour", kind: "group", unread: 4 },
    ],
  },
];

export default function ConversationListExample() {
  const [active, setActive] = createSignal("design");
  const [groups, setGroups] = createSignal(GROUPS);
  return (
    <Stack gap={3}>
      <div class={sidebar}>
        <ConversationList
          aria-label="Conversations"
          groups={groups()}
          activeId={active()}
          storageKey="gallery-conversations"
          onSelect={(conversation) => {
            setActive(conversation.id);
            setGroups(
              groups().map((group) => ({
                ...group,
                conversations: group.conversations.map((one) =>
                  one.id === conversation.id ? { ...one, unread: 0, mentions: 0 } : one,
                ),
              })),
            );
          }}
        />
      </div>
      <Text size="sm" color="muted">
        Open: {active()}. Opening one reads it; a heading folds its group.
      </Text>
    </Stack>
  );
}
