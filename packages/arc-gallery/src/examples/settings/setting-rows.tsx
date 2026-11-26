import { createSignal } from "@barqjs/core";
import {
  Button,
  type FeatureToggle,
  FeatureToggles,
  PlanGate,
  Select,
  SelectItem,
  SettingRow,
  SettingsSection,
  Stack,
  toast,
  useArcForm,
} from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MODULES: readonly FeatureToggle[] = [
  { id: "grades", label: "Gradebook", description: "Marks, weighting and term grades." },
  {
    id: "reports",
    label: "Report cards",
    description: "Printed from the term grades.",
    requires: ["grades"],
  },
  { id: "transcripts", label: "Transcripts", requires: ["reports"] },
  {
    id: "sis",
    label: "Student records sync",
    description: "Nightly sync with the district's records system.",
    locked: {
      reason: "Included in the District plan.",
      badge: "District",
      action: (
        <Button variant="link" size="xs" onPress={() => toast.success("We'll be in touch")}>
          Ask about it
        </Button>
      ),
    },
  },
  { id: "state", label: "State reporting", requires: ["sis"] },
];

const RETENTION = [
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "365", label: "A year" },
];

export default function SettingRowsExample() {
  const [twoFactor, setTwoFactor] = createSignal(false);
  const [retention, setRetention] = createSignal("90");
  const [retentionState, setRetentionState] = createSignal<"idle" | "saving" | "saved">("idle");
  const modules = useArcForm(() => ({
    defaultValues: { modules: ["grades", "reports"] as string[] },
    onSubmit: () => wait(600),
  }));
  const general = useArcForm(() => ({ defaultValues: { name: "Acme Operations" } }));

  async function changeRetention(next: string) {
    setRetention(next);
    setRetentionState("saving");
    await wait(700);
    setRetentionState("saved");
  }

  return (
    <Stack gap={6}>
      <SettingsSection
        heading="Security"
        description="Applied as soon as you change them."
        list={
          <>
            <SettingRow
              label="Require two-factor sign-in"
              description="Members without it are asked to set it up when they next sign in."
              checked={twoFactor()}
              onCheckedChange={async (on: boolean) => {
                await wait(600);
                setTwoFactor(on);
              }}
            />
            <SettingRow
              label="Allow public projects"
              description="Anyone with the link can read a public project. Try turning it off."
              defaultChecked
              onCheckedChange={async () => {
                await wait(600);
                throw new Error("only workspace owners can change this");
              }}
            />
            <SettingRow
              label="Keep audit logs for"
              description="Older entries are deleted every night."
              status={retentionState()}
              control={(ids) => (
                <Select
                  items={RETENTION}
                  value={retention()}
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description}
                  onValueChange={(value: string) => void changeRetention(value)}
                >
                  {(item: (typeof RETENTION)[number]) => <SelectItem>{item.label}</SelectItem>}
                </Select>
              )}
            />
            <SettingRow
              label="Single sign-on"
              description="Members sign in through your identity provider."
              locked={{
                reason: "Available on the Business plan.",
                badge: "Business",
                action: (
                  <Button variant="link" size="xs" href="#setting-rows">
                    See plans
                  </Button>
                ),
              }}
            />
          </>
        }
      />
      <SettingsSection
        heading="Modules"
        description="What your school uses. Modules that need one another turn on and off together."
        form={modules}
      >
        <modules.AppField name="modules">
          {() => <FeatureToggles aria-label="Modules" features={MODULES} />}
        </modules.AppField>
      </SettingsSection>
      <SettingsSection
        heading="General"
        description="The workspace's name, shown on every invoice."
        form={general}
        readOnly="Only workspace owners can change these."
      >
        <general.AppField name="name">
          {(field) => <field.TextField label="Workspace name" />}
        </general.AppField>
      </SettingsSection>
      <SettingsSection heading="Network allowlist" description="Where members may sign in from.">
        <PlanGate
          allowed={false}
          title="IP allowlists are on the Business plan"
          description="Limit sign-in to your office and VPN addresses."
          action={
            <Button size="sm" variant="outline" href="#setting-rows">
              See plans
            </Button>
          }
        >
          <p>Allowlist editor</p>
        </PlanGate>
      </SettingsSection>
    </Stack>
  );
}
