import { createSignal } from "@barqjs/core";
import { Inline, SaveStatus, SettingRow, Stack, Text, useArcForm, useAutosave } from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Lesson {
  title: string;
  summary: string;
}

const START: Lesson = {
  title: "Introduction to sets",
  summary: "Sets, members and the empty set, with Venn diagrams.",
};

export default function AutosaveExample() {
  const [failing, setFailing] = createSignal(false);
  const [saves, setSaves] = createSignal(0);
  const form = useArcForm(() => ({
    defaultValues: START,
  }));
  const autosave = useAutosave<Lesson>({
    value: form.useSelector((state) => state.values),
    blockedBy: (lesson) => (lesson.title.trim() === "" ? "A lesson needs a title" : undefined),
    save: async () => {
      await wait(800);
      if (failing()) throw new Error("the server is not answering");
      setSaves((count) => count + 1);
    },
  });
  return (
    <Stack gap={4}>
      <Inline gap={3} align="center" justify="between">
        <Text weight="medium">Lesson</Text>
        <SaveStatus autosave={autosave} compact />
      </Inline>
      <form.AppForm>
        <Stack gap={4}>
          <form.AppField name="title">
            {(field) => (
              <field.TextField
                label="Title"
                description="Saved a second after you stop typing. Empty it to see it held."
              />
            )}
          </form.AppField>
          <form.AppField name="summary">
            {(field) => (
              <field.TextareaField
                label="Summary"
                rows={3}
                description="Ctrl or Cmd+S saves at once."
              />
            )}
          </form.AppField>
        </Stack>
      </form.AppForm>
      <SettingRow
        label="Fail the next saves"
        description="Shows Not saved with the reason and a Retry."
        checked={failing()}
        onCheckedChange={(on: boolean) => setFailing(on)}
      />
      <Inline gap={4}>
        <SaveStatus state="saving" />
        <SaveStatus state="saved" />
        <SaveStatus state="offline" />
        <SaveStatus state="blocked" reason="A lesson needs a title" />
        <SaveStatus state="error" reason="The server is not answering." onRetry={() => {}} />
      </Inline>
      <Text size="sm" color="muted">{`Saves so far: ${String(saves())}`}</Text>
    </Stack>
  );
}
