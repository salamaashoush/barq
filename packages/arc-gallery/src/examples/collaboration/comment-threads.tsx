import { createSignal } from "@barqjs/core";
import {
  type CommentData,
  type CommentDraft,
  type CommentThreadData,
  CommentThreadList,
  toast,
} from "@barqjs/arc";
import { space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

import { MENTIONABLE, SALAMA, specThreads } from "../../data/comments.ts";

const demo = layer("demo");
const column = demo({ maxWidth: "36rem", paddingBlockEnd: space.x2 });

/** A round trip to the server. A body that says "fail" is refused, to see Retry and Discard. */
const save = (body?: string): Promise<void> =>
  new Promise((resolve, reject) => {
    setTimeout(
      () => (body?.toLowerCase().includes("fail") ? reject(new Error("refused")) : resolve()),
      400,
    );
  });

export default function CommentThreads() {
  const [threads, setThreads] = createSignal<readonly CommentThreadData[]>(specThreads(Date.now()));
  const [anchor, setAnchor] = createSignal<string | undefined>(undefined);
  let made = 0;

  const comment = (draft: CommentDraft): CommentData => ({
    id: `new-${++made}`,
    author: SALAMA,
    body: draft.body,
    mentions: draft.mentions,
    createdAt: new Date().toISOString(),
  });
  const update = (id: string, change: (thread: CommentThreadData) => CommentThreadData): void => {
    setThreads(threads().map((thread) => (thread.id === id ? change(thread) : thread)));
  };

  return (
    <div class={column}>
      <CommentThreadList
        threads={threads()}
        currentUser={SALAMA}
        mentionables={MENTIONABLE}
        anchor={anchor()}
        onAnchorChange={setAnchor}
        onAnchorPress={(thread) => setAnchor(thread.anchor?.id)}
        onCreate={async (draft) => {
          await save(draft.body);
          setThreads([{ id: `new-thread-${++made}`, comments: [comment(draft)] }, ...threads()]);
        }}
        onReply={async (threadId, draft) => {
          await save(draft.body);
          update(threadId, (thread) => ({
            ...thread,
            comments: [...thread.comments, comment(draft)],
          }));
        }}
        onEdit={async (edited, draft, threadId) => {
          await save(draft.body);
          update(threadId, (thread) => ({
            ...thread,
            comments: thread.comments.map((one) =>
              one.id === edited.id
                ? {
                    ...one,
                    body: draft.body,
                    mentions: draft.mentions,
                    editedAt: new Date().toISOString(),
                  }
                : one,
            ),
          }));
        }}
        onDelete={async (deleted, threadId) => {
          await save();
          update(threadId, (thread) => ({
            ...thread,
            comments: thread.comments.filter((one) => one.id !== deleted.id),
          }));
          toast("Comment deleted");
        }}
        onResolve={async (threadId, resolved) => {
          await save();
          update(threadId, (thread) => ({ ...thread, resolved }));
        }}
        onReact={async (reacted, emoji, add, threadId) => {
          await save();
          update(threadId, (thread) => ({
            ...thread,
            comments: thread.comments.map((one) => {
              if (one.id !== reacted.id) return one;
              const others = (one.reactions ?? []).filter((reaction) => reaction.emoji !== emoji);
              const held = one.reactions?.find((reaction) => reaction.emoji === emoji);
              const count = (held?.count ?? 0) + (add ? 1 : -1);
              return {
                ...one,
                reactions: count > 0 ? [...others, { emoji, count, reacted: add }] : others,
              };
            }),
          }));
        }}
      />
    </div>
  );
}
