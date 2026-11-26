import { createSignal } from "@barqjs/core";
import {
  CheckboxGroupField,
  type GroupOption,
  Grid,
  RadioGroupField,
  Stack,
  Text,
} from "@barqjs/arc";

const SEVERITIES: GroupOption[] = [
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "info", label: "Info" },
];

const PERMISSIONS: GroupOption[] = [
  { value: "checks.read", label: "Read checks", description: "See checks, runs and results." },
  { value: "checks.write", label: "Edit checks", description: "Create, change and delete checks." },
  {
    value: "incidents.write",
    label: "Handle incidents",
    description: "Acknowledge, resolve and comment.",
  },
  {
    value: "billing",
    label: "Manage billing",
    description: "Change the plan and payment method.",
    caveat: "Only owners can grant this.",
    isDisabled: true,
  },
];

const AUDITS: GroupOption[] = [
  { value: "contrast", label: "Colour contrast" },
  { value: "labels", label: "Form labels" },
  { value: "alt", label: "Image text", caveat: "Not run on pages behind a sign-in." },
  { value: "landmarks", label: "Landmarks" },
  { value: "headings", label: "Heading order" },
  { value: "focus", label: "Focus order" },
];

const STRATEGIES: GroupOption[] = [
  { value: "all", label: "Every location", description: "Each run goes to every location." },
  { value: "round", label: "One at a time", description: "Locations take turns, run by run." },
  { value: "quorum", label: "Quorum", description: "Alert once a number of locations agree." },
];

export default function ChoiceGroups() {
  const [severities, setSeverities] = createSignal<readonly string[]>(["critical", "major"]);
  const [strategy, setStrategy] = createSignal<string | null>("all");
  return (
    <Stack gap={8}>
      <CheckboxGroupField
        label="Page for"
        layout="row"
        isRequired
        options={SEVERITIES}
        shortcuts={[
          { label: "All", values: ["critical", "major", "minor", "info"] },
          { label: "Urgent only", values: ["critical"] },
        ]}
        value={severities()}
        onChange={setSeverities}
        description="Clear them all to see the at-least-one rule."
      />
      <CheckboxGroupField
        label="Permissions"
        layout="grid"
        options={PERMISSIONS}
        defaultValue={["checks.read", "retired.scope"]}
        unknownLabel={(value) => `${value} (retired)`}
      />
      <CheckboxGroupField
        label="Audits"
        control="switch"
        layout="grid"
        minColumnWidth="12rem"
        options={AUDITS}
        defaultValue={["contrast", "labels"]}
        description="None turned on means every audit runs."
      />
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <RadioGroupField
          label="Run strategy"
          options={STRATEGIES}
          value={strategy()}
          onChange={setStrategy}
        />
        <Stack gap={4}>
          <CheckboxGroupField
            label="Subscribed (read only)"
            isReadOnly
            options={SEVERITIES}
            defaultValue={["critical"]}
          />
          <RadioGroupField label="Plan (read only)" isReadOnly options={STRATEGIES} />
        </Stack>
      </Grid>
      <Text size="xs" color="muted">
        Paging for {severities().join(", ") || "nothing"}; running {strategy() ?? "nowhere"}.
      </Text>
    </Stack>
  );
}
