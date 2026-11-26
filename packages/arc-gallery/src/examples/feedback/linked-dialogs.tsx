import { createSignal } from "@barqjs/core";
import {
  Button,
  Field,
  FieldLabel,
  Inline,
  Input,
  ResponsiveOverlay,
  Stack,
  Tearsheet,
  Link,
  Text,
} from "@barqjs/arc";

export default function LinkedDialogs() {
  const [title, setTitle] = createSignal("Untitled puzzle about the water cycle");
  const [saved, setSaved] = createSignal(false);
  return (
    <Stack gap={4}>
      <Inline gap={2} wrap>
        <ResponsiveOverlay
          heading="New tunnel"
          description="Opened by its button or by a link to ?create."
          param="create"
          clearParams={["preset"]}
          trigger={<Button>New tunnel</Button>}
          footer={<Button>Create tunnel</Button>}
        >
          <Field>
            <FieldLabel for="tunnel-name">Name</FieldLabel>
            <Input id="tunnel-name" value="office" />
          </Field>
        </ResponsiveOverlay>
        <Link href="?create=1&preset=ssh">Open it from a link</Link>
        <Button variant="outline" href="?editor=1">
          Open the editor
        </Button>
      </Inline>
      <Text size="sm" color="muted">
        Closing either takes its parameters back out of the address, so a reload does not open it
        again.
        {saved() ? " The puzzle was saved." : ""}
      </Text>
      <Tearsheet
        size="full"
        param="editor"
        heading={title()}
        actions={
          <Inline gap={2}>
            <Button variant="outline">Preview</Button>
            <Button onPress={() => setSaved(true)}>Save</Button>
          </Inline>
        }
      >
        <Field>
          <FieldLabel for="puzzle-title">Title</FieldLabel>
          <Input
            id="puzzle-title"
            value={title()}
            onInput={(event: Event) => setTitle((event.target as HTMLInputElement).value)}
          />
        </Field>
      </Tearsheet>
    </Stack>
  );
}
