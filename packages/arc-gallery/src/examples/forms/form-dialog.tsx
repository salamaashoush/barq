import { createSignal } from "@barqjs/core";
import {
  Button,
  CopyButton,
  FormDialog,
  Inline,
  Stack,
  SuccessState,
  setServerErrors,
  toast,
  useArcForm,
} from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
];

function OpenIncident() {
  const form = useArcForm(() => ({
    defaultValues: { title: "", severity: "major", note: "" },
    onSubmit: async ({ value, formApi }) => {
      await wait(700);
      if (value.title.toLowerCase().includes("checkout")) {
        setServerErrors(formApi, { fields: { title: "INC-41 is already open for checkout" } });
        return;
      }
      toast.success(`Opened: ${value.title}`);
    },
  }));
  return (
    <FormDialog
      form={form}
      heading="Open an incident"
      description="Everyone on call hears of it. Name checkout to see the server refuse it."
      trigger={<Button>Open incident</Button>}
      submitLabel="Open incident"
      param="open-incident"
    >
      <form.AppField
        name="title"
        validators={{
          onChange: ({ value }) => (value.trim() === "" ? "Enter a title" : undefined),
        }}
      >
        {(field) => <field.TextField label="Title" />}
      </form.AppField>
      <form.AppField name="severity">
        {(field) => <field.SelectField label="Severity" options={SEVERITIES} />}
      </form.AppField>
      <form.AppField name="note">
        {(field) => (
          <field.TextareaField
            label="Note"
            rows={3}
            description="The first entry on its timeline."
          />
        )}
      </form.AppField>
    </FormDialog>
  );
}

function EditPolicy() {
  const [open, setOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const form = useArcForm(() => ({
    defaultValues: { name: "", repeat: 2 },
    onSubmit: () => wait(600),
  }));
  async function edit(fail: boolean) {
    setFailed(false);
    setLoading(true);
    setOpen(true);
    await wait(900);
    setLoading(false);
    if (fail) setFailed(true);
    else form.reset({ name: "Primary on-call", repeat: 3 });
  }
  return (
    <>
      <Inline gap={2}>
        <Button variant="outline" onPress={() => void edit(false)}>
          Edit policy
        </Button>
        <Button variant="outline" onPress={() => void edit(true)}>
          Edit a deleted policy
        </Button>
      </Inline>
      <FormDialog
        form={form}
        heading="Edit escalation policy"
        open={open()}
        onOpenChange={setOpen}
        loading={loading()}
        loadError={failed() ? "The policy was deleted by Lina a minute ago." : undefined}
      >
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        <form.AppField name="repeat">
          {(field) => <field.NumberField label="Repeat" unit="times" min={0} max={9} />}
        </form.AppField>
      </FormDialog>
    </>
  );
}

function NewKey() {
  const [made, setMade] = createSignal("");
  const form = useArcForm(() => ({
    defaultValues: { name: "" },
    onSubmit: async () => {
      await wait(600);
      setMade(`ak_live_${Math.random().toString(36).slice(2, 18)}`);
    },
  }));
  return (
    <FormDialog
      form={form}
      heading="New API key"
      trigger={<Button variant="outline">New API key</Button>}
      submitLabel="Create key"
      result={() => (
        <SuccessState
          heading="Your key is ready"
          description="Copy it now: it is not shown again."
          placement="section"
          actions={<CopyButton value={made()}>Copy the key</CopyButton>}
        />
      )}
    >
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" description="Where it is used: CI, a script." />}
      </form.AppField>
    </FormDialog>
  );
}

export default function FormDialogExample() {
  return (
    <Stack gap={3}>
      <Inline gap={2}>
        <OpenIncident />
        <NewKey />
      </Inline>
      <EditPolicy />
    </Stack>
  );
}
