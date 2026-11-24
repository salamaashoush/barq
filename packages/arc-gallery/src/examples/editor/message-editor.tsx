import { Show, createSignal } from "@barqjs/core";
import { Button, Stack, Text, toast } from "@barqjs/arc";
import type { ChatMessage } from "@barqjs/arc/chat";
import { MessageEditor, RichTextRenderer, documentToText } from "@barqjs/arc/editor";

import { mentionPeople } from "../../data/directory.ts";

export default function MessageEditorExample() {
  const [message, setMessage] = createSignal<ChatMessage>({
    id: "m-1",
    author: { id: "member-1", name: "Salama" },
    createdAt: "2026-11-24T09:30:00.000Z",
    body: "The deploy window moves to Thursday at 10:00.\nPing me if that clashes with the billing freeze.",
  });
  const [editing, setEditing] = createSignal(true);

  return (
    <Stack gap={3}>
      <Show
        when={editing()}
        fallback={
          <Stack gap={2}>
            <Show when={message().content} fallback={<Text>{message().body}</Text>}>
              {(content) => <RichTextRenderer value={content()} size="sm" />}
            </Show>
            <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
              Edit again
            </Button>
          </Stack>
        }
      >
        <MessageEditor
          message={message()}
          mentions={mentionPeople}
          maxLength={500}
          onSave={(saved, edited) =>
            new Promise<void>((resolve) =>
              setTimeout(() => {
                setMessage({ ...saved, content: edited.value, editedAt: new Date().toISOString() });
                setEditing(false);
                toast.success("Message edited", {
                  description: documentToText(edited.value).slice(0, 60),
                });
                resolve();
              }, 300),
            )
          }
          onCancel={() => setEditing(false)}
        />
      </Show>
    </Stack>
  );
}
