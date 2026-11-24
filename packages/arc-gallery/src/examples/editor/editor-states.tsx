import { Grid } from "@barqjs/arc";
import { RichTextEditor } from "@barqjs/arc/editor";

export default function EditorStates() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
      <RichTextEditor
        label="Empty"
        placeholder="Describe the incident for Acme's status page"
        minHeight={120}
      />
      <RichTextEditor
        label="Read-only"
        readOnly
        toolbar={false}
        defaultMarkdown={
          "**Resolved.** checkout-service is back to a 0.1% error rate.\n\nPostmortem due Friday."
        }
      />
      <RichTextEditor
        label="Invalid"
        invalid
        aria-describedby="summary-error"
        defaultMarkdown="Too short"
        toolbar={["marks"]}
        minHeight={100}
      />
      <RichTextEditor
        label="Plain and small, with a limit"
        variant="plain"
        size="sm"
        toolbar={false}
        maxLength={80}
        defaultMarkdown="A compact editor for a one-line summary, counting toward its limit of 80."
      />
    </Grid>
  );
}
