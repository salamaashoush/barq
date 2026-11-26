import { createSignal } from "@barqjs/core";
import { DescriptionList, InlineEdit, InlineSelect, Stack } from "@barqjs/arc";

const PEOPLE = [
  { value: "salama", label: "Salama" },
  { value: "ops", label: "Operations rota" },
  { value: "web", label: "Web team" },
];

const SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function InlineEditing() {
  const [title, setTitle] = createSignal("Checkout latency above 2 s in eu-west");
  const [notes, setNotes] = createSignal("");
  const [owner, setOwner] = createSignal<string | null>("salama");
  const [severity, setSeverity] = createSignal<string | null>("major");
  const facts = [
    {
      term: "Assignee",
      details: (
        <InlineSelect
          label="Assignee"
          value={owner()}
          options={PEOPLE}
          noneLabel="Nobody"
          onSave={async (next) => {
            await wait(500);
            setOwner(next);
          }}
        />
      ),
    },
    {
      term: "Severity",
      details: (
        <InlineSelect
          label="Severity"
          value={severity()}
          options={SEVERITIES}
          onSave={setSeverity}
        />
      ),
    },
    {
      term: "Escalation",
      details: (
        <InlineSelect
          label="Escalation"
          value="legacy-policy"
          options={PEOPLE}
          unknownLabel={() => "Legacy policy"}
          isDisabled
          onSave={() => undefined}
        />
      ),
    },
  ];
  return (
    <Stack gap={6}>
      <InlineEdit
        label="Title"
        value={title()}
        validate={(next) => (next.trim() === "" ? "A title is needed." : undefined)}
        onSave={async (next) => {
          await wait(500);
          setTitle(next);
        }}
      />
      <InlineEdit
        label="Notes"
        multiline
        placeholder="Add notes for whoever picks this up"
        value={notes()}
        onSave={setNotes}
      />
      <InlineEdit
        label="Runbook"
        value="https://example.com/runbooks/checkout"
        onSave={async () => {
          await wait(400);
          throw new Error("Runbook links can only be changed by an admin.");
        }}
      />
      <DescriptionList items={facts} />
    </Stack>
  );
}
