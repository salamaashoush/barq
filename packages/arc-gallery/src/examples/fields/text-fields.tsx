import { createSignal } from "@barqjs/core";
import {
  Grid,
  IdentifierField,
  SlugField,
  Stack,
  SuggestionField,
  TagInput,
  Text,
  useArcForm,
} from "@barqjs/arc";

const TAKEN = ["acme", "acme-2", "northwind"];
const GROUPS = ["Website", "Public API", "Payments", "Workers"];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isFree(slug: string, signal: AbortSignal): Promise<boolean> {
  await wait(600);
  if (signal.aborted) return false;
  return !TAKEN.includes(slug) && slug !== "admin";
}

export default function TextFields() {
  const [hosts, setHosts] = createSignal<readonly string[]>(["api.example.com", "example.com"]);
  const form = useArcForm(() => ({
    defaultValues: { name: "Acme", slug: "", title: "", bio: "مدرسة الأمل الدولية" },
  }));
  const name = form.useSelector((state) => state.values.name);
  return (
    <Stack gap={8}>
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <form.AppForm>
          <form.AppField name="name">
            {(field) => <field.TextField label="Workspace name" />}
          </form.AppField>
          <form.AppField name="slug">
            {(field) => (
              <field.SlugField
                label="Address"
                source={name()}
                prefix="acme.app/"
                taken={TAKEN}
                checkAvailability={isFree}
                description="Followed from the name until you type over it."
              />
            )}
          </form.AppField>
        </form.AppForm>
        <SlugField label="Project address" source="Northwind Traders" prefix="/" collapsed />
        <SuggestionField
          label="Group"
          suggestions={GROUPS}
          placeholder="Website"
          description="Pick one in use or name a new one."
        />
      </Grid>
      <Grid columns={{ base: 1, md: 3 }} gap={6}>
        <IdentifierField label="Variable" convention="upper-snake" defaultValue="API_TOKEN" />
        <IdentifierField label="Environment" convention="kebab" defaultValue="staging-eu" />
        <IdentifierField label="File name" convention="filename" defaultValue="report-q3.pdf" />
      </Grid>
      <TagInput
        line
        label="Allowed hosts"
        description="Separate them with commas."
        value={hosts()}
        onChange={setHosts}
        normalize={(host) => host.trim().toLowerCase()}
        validate={(host) => (host.includes(".") ? undefined : `${host} is not a host name`)}
      />
      <form.AppForm>
        <Grid columns={{ base: 1, md: 2 }} gap={6}>
          <form.AppField name="title">
            {(field) => <field.TextField label="Title" description="Type in Arabic or English." />}
          </form.AppField>
          <form.AppField name="bio">
            {(field) => <field.TextareaField label="About" rows={3} />}
          </form.AppField>
        </Grid>
      </form.AppForm>
      <Text size="xs" color="muted">
        Hosts: {hosts().join(", ")}
      </Text>
    </Stack>
  );
}
