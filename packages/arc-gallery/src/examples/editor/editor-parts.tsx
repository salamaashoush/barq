import {
  Button,
  Inline,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Stack,
  Status,
  Text,
} from "@barqjs/arc";
import {
  FloatingFormatToolbar,
  RichTextEditor,
  TableSizePicker,
  insertDivider,
  insertTable,
  useCharacterCount,
  useEditorAutosave,
} from "@barqjs/arc/editor";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Table2 } from "@barqjs/lucide/icons/table-2";

const NOTES = `### Standup, Tuesday

Lina shipped the **invoice export**. Omar is on the *SSO* rollout.

| Service | Owner | Status |
| --- | --- | --- |
| api-gateway | Salama | Live |
| billing-service | Lina | In review |
`;

/** The editor's own state, read from inside it. */
function Footer() {
  const count = useCharacterCount(() => 600);
  const autosave = useEditorAutosave({
    delay: 600,
    save: () => new Promise((resolve) => setTimeout(resolve, 500)),
  });
  return (
    <Inline gap={3} align="center" justify="between">
      <Status
        tone={
          autosave.status() === "error"
            ? "danger"
            : autosave.status() === "saved"
              ? "success"
              : "neutral"
        }
      >
        {autosave.status() === "saving"
          ? "Saving"
          : autosave.status() === "saved"
            ? "Saved"
            : "Not saved yet"}
      </Status>
      <Text size="xs" color={count.over() ? "danger" : "muted"} numeric>
        {count.remaining()} of 600 left
      </Text>
    </Inline>
  );
}

type Editor = Parameters<typeof insertTable>[0];

export default function EditorParts() {
  let editor: Editor | undefined;
  return (
    <Stack gap={3}>
      <Inline gap={2} wrap>
        <Popover>
          <PopoverTrigger>
            <Button variant="outline" size="sm">
              <Table2 />
              Insert a table
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <TableSizePicker
              maxRows={6}
              maxColumns={6}
              onPick={(rows, columns) => {
                if (editor !== undefined) insertTable(editor, rows, columns);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="sm"
          onPress={() => editor !== undefined && insertDivider(editor)}
        >
          <Minus />
          Divider
        </Button>
      </Inline>
      <RichTextEditor
        label="Meeting notes"
        defaultMarkdown={NOTES}
        toolbar={["history", "marks", "link", "lists", "insert"]}
        floatingToolbar={false}
        onEditor={(made) => {
          editor = made;
        }}
      >
        <FloatingFormatToolbar marks={["bold", "italic", "code"]} />
        <Footer />
      </RichTextEditor>
      <Text size="sm" color="muted">
        Click into the table for its row and column controls at the cell's corner; drag a column's
        edge to resize it.
      </Text>
    </Stack>
  );
}
