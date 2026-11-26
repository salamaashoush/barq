import { createSignal } from "@barqjs/core";
import {
  DescriptionList,
  DockedPanelToggle,
  IconButton,
  List,
  ListItem,
  PersonAvatar,
  toast,
} from "@barqjs/arc";
import {
  type ChatMessage,
  ConversationLayout,
  MessageList,
  TypingIndicator,
} from "@barqjs/arc/chat";
import { ChatComposer, type ComposedMessage } from "@barqjs/arc/editor";
import { layer } from "@barqjs/css";
import { Hash } from "@barqjs/lucide/icons/hash";
import { Info } from "@barqjs/lucide/icons/info";
import { Phone } from "@barqjs/lucide/icons/phone";
import { Users } from "@barqjs/lucide/icons/users";

import { ME, TEAM, designHistory } from "../../data/chat.ts";
import { mentionPeople } from "../../data/directory.ts";

const demo = layer("demo");
const frame = demo({ height: "36rem", borderRadius: "var(--radius)", overflow: "hidden" });

export default function ConversationLayoutExample() {
  const [messages, setMessages] = createSignal<readonly ChatMessage[]>(
    designHistory(Date.parse("2026-11-24T09:00:00Z"), 40),
  );
  const [panel, setPanel] = createSignal<string | null>(null);

  function send(sent: ComposedMessage): void {
    setMessages([
      ...messages(),
      {
        id: `mine-${Date.now()}`,
        author: ME,
        createdAt: new Date().toISOString(),
        content: sent.value,
      },
    ]);
  }

  return (
    <div class={frame}>
      <ConversationLayout
        heading="design"
        icon={<Hash />}
        topic="Reviews, critiques and the Friday demo"
        actions={
          <>
            <IconButton label="Start a huddle" onPress={() => toast("Huddle started")}>
              <Phone />
            </IconButton>
            <DockedPanelToggle panel="members" />
            <DockedPanelToggle panel="details" />
          </>
        }
        storageKey="gallery-conversation"
        activePanel={panel()}
        onActivePanelChange={setPanel}
        panels={[
          {
            id: "members",
            label: "Members",
            icon: Users,
            count: TEAM.length,
            content: () => (
              <List aria-label="Members" items={TEAM}>
                {(person) => (
                  <ListItem
                    media={<PersonAvatar person={person} size="sm" />}
                    mediaVariant="default"
                    title={person.name}
                    description={person.presence}
                  />
                )}
              </List>
            ),
          },
          {
            id: "details",
            label: "Details",
            icon: Info,
            content: () => (
              <DescriptionList
                layout="stacked"
                items={[
                  { term: "Topic", details: "Reviews, critiques and the Friday demo" },
                  { term: "Created by", details: "Salama on 3 March" },
                  { term: "Members", details: String(TEAM.length) },
                ]}
              />
            ),
          },
        ]}
        typing={<TypingIndicator people={[{ name: "Lina" }]} />}
        composer={
          <ChatComposer
            label="Message #design"
            placeholder="Message #design"
            mentions={mentionPeople}
            onSend={send}
          />
        }
      >
        <MessageList aria-label="#design" messages={messages()} currentUserId={ME.id} />
      </ConversationLayout>
    </div>
  );
}
