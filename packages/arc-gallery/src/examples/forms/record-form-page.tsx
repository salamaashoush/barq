import { createSignal } from "@barqjs/core";
import {
  type DangerAction,
  DangerZone,
  FormActionBar,
  PageHeader,
  RecordFormPage,
  Stack,
  Text,
  toast,
  useArcForm,
} from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Intent {
  intent?: string;
}

interface CheckedValue {
  value: string;
}

function required({ value }: CheckedValue): string | undefined {
  return value.trim() === "" ? "Enter this" : undefined;
}

const YEARS = [
  { value: "7", label: "Year 7" },
  { value: "8", label: "Year 8" },
  { value: "9", label: "Year 9" },
];

const DANGER: readonly DangerAction[] = [
  {
    id: "withdraw",
    title: "Withdraw the student",
    description: "Their record is kept for the year and then archived.",
    label: "Withdraw",
    confirm: { title: "Withdraw Salama?", confirmLabel: "Withdraw" },
    onAction: () => wait(600),
  },
];

function Student() {
  const [added, setAdded] = createSignal(0);
  const form = useArcForm(() => ({
    defaultValues: {
      first: "",
      last: "",
      email: "",
      year: null as string | null,
      guardian: "",
      phone: "",
    },
    onSubmitMeta: {} as Intent,
    onSubmit: async ({ value, meta }) => {
      await wait(700);
      toast.success(`Saved ${value.first} ${value.last}`);
      if (meta.intent === "another") {
        setAdded((count) => count + 1);
        form.reset();
      }
    },
  }));
  return (
    <Stack gap={4}>
      <PageHeader
        heading="New student"
        description="Save with fields left empty to see the summary of what to fix."
      />
      <RecordFormPage
        form={form}
        secondary={{ label: "Save and add another", intent: "another" }}
        onCancel={() => toast("Back to the list")}
        danger={<DangerZone actions={DANGER} />}
      >
        <form.AppField name="first" validators={{ onSubmit: required }}>
          {(field) => <field.TextField label="First name" />}
        </form.AppField>
        <form.AppField name="last" validators={{ onSubmit: required }}>
          {(field) => <field.TextField label="Last name" />}
        </form.AppField>
        <form.AppField name="email" validators={{ onSubmit: required }}>
          {(field) => <field.TextField label="School email" type="email" />}
        </form.AppField>
        <form.AppField
          name="year"
          validators={{ onSubmit: ({ value }) => (value === null ? "Choose a year" : undefined) }}
        >
          {(field) => <field.SelectField label="Year group" options={YEARS} />}
        </form.AppField>
        <form.AppField name="guardian" validators={{ onSubmit: required }}>
          {(field) => <field.TextField label="Guardian" />}
        </form.AppField>
        <form.AppField name="phone" validators={{ onSubmit: required }}>
          {(field) => <field.TextField label="Guardian's phone" type="tel" />}
        </form.AppField>
      </RecordFormPage>
      <Text size="sm" color="muted">{`Added with Save and add another: ${String(added())}`}</Text>
    </Stack>
  );
}

function Window() {
  const form = useArcForm(() => ({
    defaultValues: { name: "Database upgrade", minutes: 45 },
    onSubmit: () => wait(600),
  }));
  return (
    <form.AppForm>
      <form
        onSubmit={(event: Event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Stack gap={4}>
          <form.AppField name="name">{(field) => <field.TextField label="Window" />}</form.AppField>
          <form.AppField name="minutes">
            {(field) => <field.NumberField label="Length" unit="min" />}
          </form.AppField>
          <FormActionBar submitLabel="Save window" />
        </Stack>
      </form>
    </form.AppForm>
  );
}

export default function RecordFormPageExample() {
  return (
    <Stack gap={10}>
      <Student />
      <Stack gap={2}>
        <Text weight="medium">The bar alone, under any form</Text>
        <Window />
      </Stack>
    </Stack>
  );
}
