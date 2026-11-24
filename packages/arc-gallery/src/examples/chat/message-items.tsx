import { For, createSignal } from "@barqjs/core";
import { Grid, Stack, Text, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";
import { type ChatMessage, MessageItem } from "@barqjs/arc/chat";

import { ME, TEAM } from "../../data/chat.ts";

const LINA = TEAM[1] ?? ME;
const AT = "2026-11-24T09:00:00.000Z";

interface MessageState {
  label: string;
  message: ChatMessage;
}

const STATES: MessageState[] = [
  {
    label: "Sent, with reactions",
    message: {
      id: "s-1",
      author: LINA,
      createdAt: AT,
      body: "The new pricing page is live 🎉",
      reactions: [
        { emoji: "🎉", count: 4, reacted: true, label: "You, Omar, Maya and Jonas" },
        { emoji: "🚀", count: 2 },
      ],
    },
  },
  {
    label: "Edited and pinned",
    message: {
      id: "s-2",
      author: ME,
      createdAt: AT,
      editedAt: AT,
      pinned: true,
      body: "Release freeze starts Thursday at 18:00 UTC.",
    },
  },
  {
    label: "With a picture and a file",
    message: {
      id: "s-3",
      author: LINA,
      createdAt: AT,
      body: "Office mockups attached.",
      attachments: [
        { id: "a-1", kind: "image", name: "office.svg", url: "/acme-office.svg" },
        { id: "a-2", kind: "file", name: "floor-plan.svg", url: "/acme-office.svg", size: 48_213 },
      ],
    },
  },
  {
    label: "With a thread",
    message: {
      id: "s-4",
      author: LINA,
      createdAt: AT,
      body: "Who can cover support on Saturday?",
      thread: { count: 5, participants: [{ name: "Omar" }, { name: "Maya" }], lastReplyAt: AT },
    },
  },
  {
    label: "Sending",
    message: {
      id: "s-5",
      author: ME,
      createdAt: AT,
      body: "Uploading the logo files now.",
      state: "pending",
    },
  },
  {
    label: "Failed",
    message: {
      id: "s-6",
      author: ME,
      createdAt: AT,
      body: "Here is the brand guide.",
      state: "failed",
      error: "You are offline.",
    },
  },
];

export default function MessageItems() {
  const [appearance, setAppearance] = createSignal<"plain" | "bubble">("plain");
  return (
    <Stack gap={4}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Appearance"
        value={appearance()}
        onValueChange={(value: string | string[]) => {
          if (value === "plain" || value === "bubble") setAppearance(value);
        }}
      >
        <ToggleGroupItem value="plain">Plain</ToggleGroupItem>
        <ToggleGroupItem value="bubble">Bubbles</ToggleGroupItem>
      </ToggleGroup>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <For each={STATES}>
          {(state) => (
            <Stack gap={1}>
              <Text size="xs" color="muted">
                {state.label}
              </Text>
              <MessageItem
                message={state.message}
                appearance={appearance()}
                currentUserId={ME.id}
                now="2026-11-24T12:00:00.000Z"
                timeZone="UTC"
                onReact={() => undefined}
                onReply={() => undefined}
                onRetry={() => undefined}
                onDiscard={() => undefined}
              />
            </Stack>
          )}
        </For>
      </Grid>
    </Stack>
  );
}
