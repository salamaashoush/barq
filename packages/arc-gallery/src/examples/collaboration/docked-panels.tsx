import { For, createSignal } from "@barqjs/core";
import {
  Badge,
  CommentComposer,
  CommentThread,
  type CommentThreadData,
  DockedPanelToggle,
  DockedPanels,
  Heading,
  Inline,
  Prose,
  Stack,
  Text,
} from "@barqjs/arc";
import { gap, layout, rounded, space, surface, type } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { History } from "@barqjs/lucide/icons/history";
import { Info } from "@barqjs/lucide/icons/info";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";

import { MENTIONABLE, SALAMA, specThreads } from "../../data/comments.ts";

const demo = layer("demo");
const frame = demo(surface.bordered, rounded.lg, layout.clip, { height: "28rem" });
const page = demo(layout.column, gap[4], { padding: space.x5 });
const facts = demo(layout.column, gap[1]);
const term = demo(type.meta);
const value = demo(type.body, layout.flush, { marginBlockEnd: space.x2 });

export default function DockedPanelsExample() {
  const [threads, setThreads] = createSignal<readonly CommentThreadData[]>(
    specThreads(Date.now()).slice(0, 2),
  );
  const [active, setActive] = createSignal<string | null>("comments");
  const open = () => threads().filter((thread) => thread.resolved !== true).length;
  const start = (body: string) =>
    setThreads([
      {
        id: `t-${threads().length + 1}`,
        comments: [
          { id: `d-${Date.now()}`, author: SALAMA, body, createdAt: new Date().toISOString() },
        ],
      },
      ...threads(),
    ]);

  return (
    <div class={frame}>
      <DockedPanels
        storageKey="gallery-docked-panels"
        active={active()}
        onActiveChange={setActive}
        panels={[
          {
            id: "details",
            label: "Details",
            icon: Info,
            content: () => (
              <dl class={facts}>
                <dt class={term}>Owner</dt>
                <dd class={value}>Salama</dd>
                <dt class={term}>Status</dt>
                <dd class={value}>In review</dd>
                <dt class={term}>Due</dt>
                <dd class={value}>December 5, 2026</dd>
              </dl>
            ),
          },
          {
            id: "comments",
            label: "Comments",
            icon: MessageSquare,
            count: open(),
            content: () => (
              <Stack gap={4}>
                <For each={threads()}>
                  {(thread) => (
                    <CommentThread
                      thread={thread}
                      currentUser={SALAMA}
                      mentionables={MENTIONABLE}
                    />
                  )}
                </For>
              </Stack>
            ),
            footer: () => (
              <CommentComposer
                label="New comment"
                placeholder="Comment on the spec"
                mentionables={MENTIONABLE}
                onSubmit={(draft) => start(draft.body)}
              />
            ),
          },
          {
            id: "history",
            label: "History",
            icon: History,
            content: () => (
              <Text size="sm" color="muted">
                Edited by Lina 3 hours ago, by Omar yesterday.
              </Text>
            ),
          },
        ]}
      >
        <div class={page}>
          <Inline justify="between" align="center" gap={2} wrap>
            <Inline gap={2} align="center">
              <Heading level={4}>Onboarding spec</Heading>
              <Badge variant="secondary">Draft</Badge>
            </Inline>
            <Inline gap={1}>
              <DockedPanelToggle panel="details" />
              <DockedPanelToggle panel="comments" />
              <DockedPanelToggle panel="history" />
            </Inline>
          </Inline>
          <Prose>
            <p>New workspaces start on the 14-day trial once their first member joins.</p>
            <p>Seats are billed monthly in arrears, and Acme Enterprise adds SSO and audit logs.</p>
          </Prose>
        </div>
      </DockedPanels>
    </div>
  );
}
