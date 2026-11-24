import { For, createSignal } from "@barqjs/core";
import {
  CommentComposer,
  type CommentDraft,
  CommentThread,
  type CommentThreadData,
  Grid,
  Stack,
  Text,
} from "@barqjs/arc";

import { MAYA, MENTIONABLE, SALAMA } from "../../data/comments.ts";

const THREAD: CommentThreadData = {
  id: "field-thread",
  anchor: { label: "Billing address" },
  comments: [
    {
      id: "f-1",
      author: MAYA,
      body: "Acme Logistics moved offices; the invoice still goes to the old address.",
      createdAt: "2026-11-20T09:30:00.000Z",
    },
  ],
};

export default function CommentComposerExample() {
  const [sent, setSent] = createSignal<readonly CommentDraft[]>([]);
  const [thread, setThread] = createSignal(THREAD);
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          One thread on a field
        </Text>
        <CommentThread
          thread={thread()}
          currentUser={SALAMA}
          mentionables={MENTIONABLE}
          onReply={(_, draft) => {
            setThread({
              ...thread(),
              comments: [
                ...thread().comments,
                {
                  id: `f-${thread().comments.length + 1}`,
                  author: SALAMA,
                  createdAt: new Date().toISOString(),
                  ...draft,
                },
              ],
            });
          }}
          onResolve={(_, resolved) => {
            setThread({ ...thread(), resolved });
          }}
        />
      </Stack>
      <Stack gap={4}>
        <CommentComposer
          label="Comment"
          placeholder="Type @ to mention someone"
          mentionables={MENTIONABLE}
          onSubmit={(draft) => setSent([...sent(), draft])}
        />
        <For each={sent()}>
          {(draft) => (
            <Text size="sm">
              Sent: {draft.body}
              {draft.mentions.length > 0
                ? ` (mentions ${draft.mentions.map((one) => one.name).join(", ")})`
                : ""}
            </Text>
          )}
        </For>
        <CommentComposer
          label="Reply to Maya"
          defaultValue="Thanks @Maya, updating it now."
          defaultMentions={[MAYA]}
          submitLabel="Reply"
          onSubmit={() => undefined}
          onCancel={() => undefined}
        />
        <CommentComposer
          label="Comment (locked)"
          placeholder="Comments are closed"
          isDisabled
          onSubmit={() => undefined}
        />
      </Stack>
    </Grid>
  );
}
