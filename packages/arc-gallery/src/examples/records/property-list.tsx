import { createSignal } from "@barqjs/core";
import {
  Badge,
  CopyButton,
  type EntityOption,
  type PropertyField,
  PropertyList,
  Stack,
  Text,
} from "@barqjs/arc";
import { SignalHigh } from "@barqjs/lucide/icons/signal-high";
import { SignalLow } from "@barqjs/lucide/icons/signal-low";
import { SignalMedium } from "@barqjs/lucide/icons/signal-medium";

import { PEOPLE, findPeople } from "./data.ts";

const FIELDS: PropertyField[] = [
  {
    id: "status",
    label: "Status",
    kind: "choice",
    options: [
      { value: "todo", label: "To do", tone: "neutral" },
      { value: "doing", label: "In progress", tone: "info" },
      { value: "review", label: "In review", tone: "warning" },
      { value: "done", label: "Done", tone: "success" },
    ],
  },
  {
    id: "priority",
    label: "Priority",
    kind: "choice",
    noneLabel: "No priority",
    options: [
      { value: "high", label: "High", icon: <SignalHigh /> },
      { value: "medium", label: "Medium", icon: <SignalMedium /> },
      { value: "low", label: "Low", icon: <SignalLow /> },
    ],
  },
  { id: "assignees", label: "Assignees", kind: "people", search: findPeople, max: 3 },
  { id: "due", label: "Due", kind: "date", clearable: true },
  { id: "summary", label: "Summary", kind: "text", multiline: true, placeholder: "Add a summary" },
  {
    id: "key",
    label: "Key",
    kind: "value",
    format: (value) => <Badge variant="outline">{String(value)}</Badge>,
    action: <CopyButton value="ACME-142" label="Copy the key" />,
  },
];

export default function PropertyListExample() {
  const [task, setTask] = createSignal<Record<string, unknown>>({
    status: "doing",
    priority: "high",
    assignees: [PEOPLE[0], PEOPLE[1]] as EntityOption[],
    due: "2026-03-12",
    summary: "Move the checkout callback to the new queue and drain the old one.",
    key: "ACME-142",
  });
  return (
    <Stack gap={8}>
      <PropertyList
        aria-label="Task"
        fields={FIELDS}
        values={task()}
        onSave={async (id, value) => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (id === "summary" && value === "") throw new Error("A task needs a summary.");
          setTask({ ...task(), [id]: value });
        }}
      />
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Read only, stacked, with rules
        </Text>
        <PropertyList
          layout="stacked"
          divided
          isDisabled
          fields={FIELDS.slice(0, 4)}
          values={task()}
          onSave={() => {}}
        />
      </Stack>
    </Stack>
  );
}
