import { ChecklistEditor, type ChecklistItem, Stack } from "@barqjs/arc";
import { createSignal } from "@barqjs/core";

const SUBTASKS: ChecklistItem[] = [
  { id: "s1", label: "Write the migration", done: true },
  { id: "s2", label: "Backfill the old rows in batches of 500", done: true },
  { id: "s3", label: "Switch reads to the new column", done: false },
  { id: "s4", label: "Drop the old column once a week has passed without a read", done: false },
];

export default function ChecklistEditorExample() {
  const [subtasks, setSubtasks] = createSignal(SUBTASKS);
  return (
    <Stack gap={8}>
      <ChecklistEditor label="Subtasks" value={subtasks()} onChange={setSubtasks} />
      <ChecklistEditor label="Launch steps" emptyLabel="No steps yet. Add the first one below." />
      <ChecklistEditor label="Signed off" defaultValue={SUBTASKS.slice(0, 2)} isDisabled />
    </Stack>
  );
}
