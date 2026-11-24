import { createSignal } from "@barqjs/core";
import { Stack, Text } from "@barqjs/arc";
import {
  EmojiShortcuts,
  MentionTypeahead,
  RichTextEditor,
  SlashCommandMenu,
  documentToMarkdown,
} from "@barqjs/arc/editor";

import { mentionPeople, uploadImage } from "../../data/directory.ts";

const BRIEF = `## Billing revamp

Invoices move to the **ledger service** this quarter. Owner: Salama.

- Totals in the customer's currency
- Credit notes for refunds
- [Runbook](https://example.com/runbooks/billing)

> Type **@** to mention someone, **/** for blocks and **:** for emoji. Select text to format it, or press Mod+K for a link.
`;

export default function RichTextEditorExample() {
  const [markdown, setMarkdown] = createSignal("");
  const [saves, setSaves] = createSignal(0);
  return (
    <Stack gap={3}>
      <RichTextEditor
        label="Project brief"
        defaultMarkdown={BRIEF}
        placeholder="Write the brief"
        maxLength={2000}
        minHeight={240}
        maxHeight={520}
        upload={uploadImage}
        autosave={{
          delay: 800,
          save: () =>
            new Promise<void>((resolve) =>
              setTimeout(() => {
                setSaves(saves() + 1);
                resolve();
              }, 400),
            ),
        }}
        onChange={(value) => setMarkdown(documentToMarkdown(value))}
      >
        <MentionTypeahead source={mentionPeople} />
        <SlashCommandMenu />
        <EmojiShortcuts />
      </RichTextEditor>
      <Text size="xs" color="muted" numeric>
        Saved {saves()} times · {markdown().length} characters of markdown
      </Text>
    </Stack>
  );
}
