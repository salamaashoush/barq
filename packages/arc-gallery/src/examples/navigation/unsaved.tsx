import { createSignal } from "@barqjs/core";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Inline,
  Input,
  Stack,
  Text,
  UnsavedChangesGuard,
} from "@barqjs/arc";
import { Link } from "@barqjs/router";

export default function UnsavedChanges() {
  const [saved, setSaved] = createSignal("Acme status page");
  const [title, setTitle] = createSignal(saved());
  const dirty = (): boolean => title() !== saved();
  return (
    <Stack gap={4}>
      <UnsavedChangesGuard
        when={dirty()}
        heading="Leave without saving?"
        description="Your new title is lost if you leave now."
        discardLabel="Leave"
        keepLabel="Keep editing"
      />
      <Field>
        <FieldLabel for="page-title">Status page title</FieldLabel>
        <Input
          id="page-title"
          value={title()}
          onInput={(event) => setTitle((event.target as HTMLInputElement).value)}
        />
        <FieldDescription>{dirty() ? "Unsaved changes" : "Everything is saved"}</FieldDescription>
      </Field>
      <Inline gap={3} align="center" wrap>
        <Button isDisabled={!dirty()} onPress={() => setSaved(title())}>
          Save
        </Button>
        <Button variant="ghost" isDisabled={!dirty()} onPress={() => setTitle(saved())}>
          Discard
        </Button>
        <Text size="sm">
          Edit the title, then try <Link to="/foundations">another page</Link>.
        </Text>
      </Inline>
    </Stack>
  );
}
