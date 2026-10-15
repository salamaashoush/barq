import { For, Show, createSignal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { RotateCw } from "@barqjs/lucide/icons/rotate-cw";
import {
  Bubble,
  BubbleContent,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Marker,
  MarkerContent,
  Message,
  MessageContent,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type BubbleVariant,
} from "@barqjs/ui";

type GroupChatItem =
  | { id: string; type: "event"; text: string; scrollAnchor?: boolean }
  | {
      id: string;
      type: "message";
      sender: string;
      role: "assistant" | "participant";
      text: string;
      scrollAnchor?: boolean;
    };

type Turn = "idle" | "marker" | "message";

const currentUser = "Salama";

const initialItems: GroupChatItem[] = [
  {
    id: "group-1",
    type: "message",
    sender: "Salama",
    role: "participant",
    text: "@mira, the astrophage line keeps matching Venus energy output. Can you check my math?",
  },
  {
    id: "group-2",
    type: "message",
    sender: "Mira (Agent)",
    role: "assistant",
    text: "Yes. Confirmed. The curve points to a microorganism harvesting stellar energy and breeding near carbon dioxide. If @omar agrees, this is the clue we need.",
  },
  {
    id: "group-3",
    type: "message",
    sender: "Salama",
    role: "participant",
    text: "ping @omar",
    scrollAnchor: true,
  },
];

const omarMarker: GroupChatItem = {
  id: "group-4",
  type: "event",
  text: "Omar has joined the chat",
  scrollAnchor: true,
};

const omarMessage: GroupChatItem = {
  id: "group-5",
  type: "message",
  sender: "Omar",
  role: "participant",
  text: "Amaze. Astrophage eats light, makes heat, goes to carbon dioxide. Omar has fuel model. Salama is smart.",
};

const shell = css`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const card = css`
  margin-inline: auto;
  height: 35rem;
  width: 100%;
  max-width: 24rem;
  gap: 0;
`;

const header = css`
  gap: calc(var(--spacing) * 1);
  border-bottom: 1px solid var(--border);
`;

const body = css`
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0;
`;

const fill = css`
  height: 100%;
`;

const log = css`
  padding: var(--card-spacing);
`;

const caption = css`
  margin-inline: auto;
  max-width: 24rem;
  padding-inline: calc(var(--spacing) * 0.5);
  text-align: center;
  font-size: 0.75rem;
  line-height: 1rem;
  text-wrap: balance;
  color: var(--muted-foreground);
`;

const footer = css`
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  border-top: 1px solid var(--border);
`;

const full = css`
  width: 100%;
`;

const hint = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

function GroupChatRow(props: Incoming<{ item: GroupChatItem }>) {
  const item = props.item();
  if (item.type === "event") {
    return (
      <MessageScrollerItem scrollAnchor={item.scrollAnchor === true}>
        <Marker variant="separator">
          <MarkerContent>{item.text}</MarkerContent>
        </Marker>
      </MessageScrollerItem>
    );
  }
  const isCurrentUser = item.sender === currentUser;
  const variant: BubbleVariant = isCurrentUser
    ? "muted"
    : item.role === "assistant"
      ? "ghost"
      : "tinted";
  return (
    <MessageScrollerItem messageId={item.id} scrollAnchor={item.scrollAnchor === true}>
      <Message align={isCurrentUser ? "end" : "start"}>
        <MessageContent>
          <Show when={!isCurrentUser}>
            <MessageHeader>{item.sender}</MessageHeader>
          </Show>
          <Bubble variant={variant}>
            <BubbleContent>{item.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

export default function MessageScrollerGroupChat() {
  const [turn, setTurn] = createSignal<Turn>("idle");
  const items = (): GroupChatItem[] =>
    turn() === "message"
      ? [...initialItems, omarMarker, omarMessage]
      : turn() === "marker"
        ? [...initialItems, omarMarker]
        : initialItems;

  return (
    <MessageScrollerProvider>
      <div class={shell}>
        <Card class={card}>
          <CardHeader class={header}>
            <CardTitle>Group Chat</CardTitle>
            <CardDescription>
              A group chat with several participants and an assistant. The Marker is marked as a
              turn.
            </CardDescription>
            <CardAction>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Reset conversation"
                    onPress={() => setTurn("idle")}
                    disabled={turn() === "idle"}
                  >
                    <RotateCw />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset</p>
                </TooltipContent>
              </Tooltip>
            </CardAction>
          </CardHeader>
          <CardContent class={body}>
            <MessageScrollerProvider>
              <MessageScroller class={fill}>
                <MessageScrollerViewport>
                  <MessageScrollerContent class={log}>
                    <For each={items()}>
                      {(item: GroupChatItem) => <GroupChatRow item={item} />}
                    </For>
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </CardContent>
          <CardFooter class={footer}>
            <Button
              type="button"
              disabled={turn() === "message"}
              onPress={() => setTurn(turn() === "idle" ? "marker" : "message")}
              class={full}
              variant="secondary"
            >
              {turn() === "idle" ? "Add Omar" : "Send Message as Omar"}
            </Button>
            <p class={hint}>
              {turn() === "idle"
                ? "This will create a marker and make it the anchor"
                : "Now send Omar's reply into the conversation"}
            </p>
          </CardFooter>
        </Card>
        <div class={caption}>
          When a user joins, a marker is created. scrollAnchor on the marker marks it as the next
          turn
        </div>
      </div>
    </MessageScrollerProvider>
  );
}
