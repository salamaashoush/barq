import { createSignal } from "@barqjs/core";
import { Grid, Stack, Text } from "@barqjs/arc";
import { BlockEditor, RichTextEditor, documentToText } from "@barqjs/arc/editor";

const RUNBOOK = [
  "# Database failover runbook",
  "Select words for the bar: **Turn into**, the marks, superscript and subscript, colour, highlight and size. Mod+Shift+H highlights, Mod+\\ clears.",
  "> [!warning]\n> Page the on-call engineer before promoting a replica.",
  "<details open>\n<summary>Before you start</summary>\n\nCheck the replica lag on the dashboard.\n\n</details>",
  "| Step | Owner | Done |\n| --- | --- | --- |\n| Freeze writes | Platform | yes |\n| Promote replica | Database | no |\n| Update DNS | Network | no |",
  "```sql\nSELECT pg_promote();\nSELECT pg_is_in_recovery();\n```",
  "Put the caret in the table for its row and column grips, or in the code block for its language and copy. Right-click a block, or press Mod+/, for its menu; Mod+D duplicates and Alt+Shift with the arrows moves it. The toolbar's Markdown shows the whole page as markdown.",
].join("\n\n");

const ARABIC = [
  "## ملاحظات الاجتماع",
  "2024",
  "ناقشنا خطة الإطلاق، والسطر الذي فوق هذا رقم بلا حروف فيتبع اتجاه المستند.",
].join("\n\n");

export default function DocumentEditor() {
  const [problem, setProblem] = createSignal(true);
  return (
    <Stack gap={6}>
      <BlockEditor label="Runbook" defaultMarkdown={RUNBOOK} />
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <Stack gap={2}>
          <RichTextEditor
            label="ملاحظات"
            language="ar"
            defaultMarkdown={ARABIC}
            minHeight={140}
            toolbar={["marks", "lists"]}
          />
          <Text size="sm" color="muted">
            Set in Arabic: the line of digits follows the document's direction.
          </Text>
        </Stack>
        <Stack gap={2}>
          <RichTextEditor
            label="Status update"
            defaultMarkdown="Write TODO somewhere in this update to see it refused."
            toolbar={["marks"]}
            minHeight={140}
            validate={(value) =>
              documentToText(value).includes("TODO") ? "Finish every TODO before publishing" : true
            }
            onValidityChange={(valid) => setProblem(!valid)}
          />
          <Text size="sm" color="muted">
            {problem() ? "Not published while it is invalid." : "Ready to publish."}
          </Text>
        </Stack>
      </Grid>
    </Stack>
  );
}
