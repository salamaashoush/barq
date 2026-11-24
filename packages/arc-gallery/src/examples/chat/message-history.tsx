import { createSignal } from "@barqjs/core";
import { Inline, Stack, Status, Switch, Label } from "@barqjs/arc";
import { type ChatMessage, MessageList, useMessageHistory } from "@barqjs/arc/chat";
import { ChatComposer } from "@barqjs/arc/editor";
import { BasicIndex, createCollection } from "@barqjs/db";
import { layout, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

import { ME, TEAM, designHistory } from "../../data/chat.ts";

const demo = layer("demo");
const pane = demo(surface.card, layout.column, layout.clip, { height: "26rem" });
const list = demo(layout.grow, layout.minZeroBlock);

interface Row {
  id: string;
  authorId: string;
  text: string;
  at: string;
}

const PEOPLE = new Map(TEAM.map((person) => [person.id, person]));

export default function MessageHistoryExample() {
  const [offline, setOffline] = createSignal(false);
  const seeded: Row[] = designHistory(Date.now(), 240).map((message) => ({
    id: message.id,
    authorId: message.author.id,
    text: message.body ?? "",
    at: new Date(message.createdAt).toISOString(),
  }));
  const messages = createCollection<Row, string>({
    id: "gallery-history",
    getKey: (row) => row.id,
    // The history pages by `at`, so it is indexed rather than sorted per page.
    autoIndex: "eager",
    defaultIndexType: BasicIndex,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        begin();
        for (const row of seeded) write({ type: "insert", value: row });
        void commit();
        markReady();
      },
    },
    onInsert: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (offline()) throw new Error("The server could not be reached.");
    },
  });
  const history = useMessageHistory<Row>({
    collection: messages,
    query: (q) => q.from({ message: messages }).orderBy(({ message }) => message.at, "desc"),
    toMessage: (row): ChatMessage => ({
      id: row.id,
      author: PEOPLE.get(row.authorId) ?? ME,
      createdAt: row.at,
      body: row.text,
    }),
    pageSize: 40,
  });

  return (
    <Stack gap={3}>
      <Inline gap={3} align="center">
        <Switch id="history-offline" checked={offline()} onCheckedChange={setOffline} />
        <Label for="history-offline">Refuse sends</Label>
        <Status tone={history.isReady() ? "success" : "neutral"}>
          {history.isReady()
            ? `${history.messages().length} loaded, ${history.hasOlder() ? "more above" : "all loaded"}`
            : "Loading"}
        </Status>
      </Inline>
      <div class={pane}>
        <div class={list}>
          <MessageList
            aria-label="#design history"
            messages={history.messages()}
            hasOlder={history.hasOlder()}
            isLoadingOlder={history.isLoadingOlder()}
            onLoadOlder={history.loadOlder}
            currentUserId={ME.id}
            onRetry={(message) => void history.retry(message.id)}
            onDiscard={(message) => history.discard(message.id)}
          />
        </div>
        <ChatComposer
          label="Message"
          onSend={(sent) =>
            history.send({
              id: `row-${Date.now()}`,
              authorId: ME.id,
              text: sent.text,
              at: new Date().toISOString(),
            })
          }
        />
      </div>
    </Stack>
  );
}
