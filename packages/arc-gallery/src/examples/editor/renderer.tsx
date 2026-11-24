import { Grid, Link, Stack, Text } from "@barqjs/arc";
import { RichTextRenderer, documentToText, markdownToDocument } from "@barqjs/arc/editor";

import { Callout, Metric } from "./block-editor.tsx";

const extensions = [Callout, Metric];

/** A document as an app stores it: Lexical's JSON, here made from markdown once. */
const STORED = markdownToDocument(
  `## Incident 2041: checkout errors

[@Omar](mention:member-3) paged [@Salama](mention:member-1) at 14:02 UTC.

> [!WARNING] Card payments failed for 6% of Acme customers for 11 minutes.

The fix rolled back \`checkout-service\` to **v3.8.2**.

| Time | Event |
| --- | --- |
| 14:02 | Alert fired |
| 14:13 | Rollback finished |

\`\`\`sql
select count(*) from payments where status = 'failed' and created_at > now() - interval '1 hour';
\`\`\`
`,
  { extensions },
);

export default function RendererExample() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Stored JSON, mentions drawn as links, headings one level down
        </Text>
        <RichTextRenderer
          value={STORED}
          extensions={extensions}
          headingOffset={1}
          renderMention={(mention) => <Link href={`#${mention.id}`}>@{mention.name}</Link>}
        />
        <Text size="xs" color="muted">
          As plain text: {documentToText(STORED, { extensions }).slice(0, 80)}…
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Markdown straight in, small
        </Text>
        <RichTextRenderer
          size="sm"
          markdown={
            "**Release 2.4.1** is live.\n\n- Faster invoice search\n- SSO for Acme Enterprise\n\nRead the [notes](https://example.com/releases/2.4.1)."
          }
        />
      </Stack>
    </Grid>
  );
}
