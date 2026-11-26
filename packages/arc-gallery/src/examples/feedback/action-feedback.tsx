import { createSignal } from "@barqjs/core";
import {
  ActionError,
  Button,
  Field,
  FieldLabel,
  Inline,
  Input,
  Stack,
  useAction,
} from "@barqjs/arc";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ActionFeedback() {
  const [name, setName] = createSignal("STRIPE_KEY");
  const remove = useAction(
    async (variable: string) => {
      await wait(600);
      return variable;
    },
    { success: (variable) => `${variable} deleted` },
  );
  const pause = useAction(async () => {
    await wait(400);
    throw { status: 409, error: { code: "conflict", message: "the check is already paused" } };
  });
  const save = useAction(
    async (value: string) => {
      await wait(500);
      if (value.trim() === "")
        throw { status: 422, error: { field: "name", message: "name is required" } };
      if (!/^[A-Z_]+$/.test(value)) throw new Error("names use capitals and underscores only");
    },
    { inline: true, success: "Saved" },
  );
  return (
    <Stack gap={4}>
      <Inline gap={2} wrap>
        <Button
          isPending={remove.pending()}
          variant="destructive"
          onPress={() => void remove.run("STRIPE_KEY")}
        >
          Delete STRIPE_KEY
        </Button>
        <Button isPending={pause.pending()} variant="outline" onPress={() => void pause.run()}>
          Pause the check
        </Button>
      </Inline>
      <Stack gap={2}>
        <ActionError action={save} title="Not saved" />
        <Field>
          <FieldLabel for="variable-name">Variable name</FieldLabel>
          <Input
            id="variable-name"
            value={name()}
            onInput={(event: Event) => setName((event.target as HTMLInputElement).value)}
          />
        </Field>
        <Inline>
          <Button isPending={save.pending()} onPress={() => void save.run(name())}>
            Save
          </Button>
        </Inline>
      </Stack>
    </Stack>
  );
}
