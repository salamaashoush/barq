import { createSignal } from "@barqjs/core";
import { Grid, Stack, TagGroup, TagInput, Text } from "@barqjs/arc";

interface Label {
  id: string;
  label: string;
}

const LABELS: Label[] = [
  { id: "billing", label: "Billing" },
  { id: "urgent", label: "Urgent" },
  { id: "acme", label: "Acme" },
  { id: "api", label: "API" },
  { id: "mobile", label: "Mobile" },
  { id: "security", label: "Security" },
  { id: "design", label: "Design" },
];

export default function Tags() {
  const [labels, setLabels] = createSignal<readonly Label[]>(LABELS);
  const [selected, setSelected] = createSignal<Set<string | number>>(new Set(["urgent"]));
  const [recipients, setRecipients] = createSignal<readonly string[]>(["salama@example.com"]);
  const [topics, setTopics] = createSignal<readonly string[]>(["release", "billing"]);

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <Stack gap={6}>
        <TagGroup
          label="Labels"
          description="Delete or Backspace removes the focused tag."
          items={labels()}
          maxVisible={5}
          onRemove={(keys) => setLabels(labels().filter((one) => !keys.has(one.id)))}
          onClearAll={() => setLabels([])}
          empty={<Text color="muted">No labels. Every issue is shown.</Text>}
        />
        <Stack gap={1}>
          <TagGroup
            label="Filter by status"
            selectionMode="multiple"
            items={[
              { id: "open", label: "Open" },
              { id: "urgent", label: "Urgent" },
              { id: "blocked", label: "Blocked" },
              { id: "done", label: "Done" },
            ]}
            disabledKeys={["done"]}
            selectedKeys={selected()}
            onSelectionChange={setSelected}
            tone="info"
            variant="subtle"
          />
          <Text size="xs" color="muted">
            Selected: {[...selected()].join(", ") || "none"}
          </Text>
        </Stack>
        <TagGroup
          aria-label="Small success tags"
          items={[
            { id: "passed", label: "Passed" },
            { id: "deployed", label: "Deployed" },
          ]}
          tone="success"
          size="sm"
        />
        <TagGroup
          label="Required labels"
          items={[]}
          isInvalid
          errorMessage="Add at least one label."
          empty={<Text color="muted">None yet</Text>}
        />
      </Stack>

      <Stack gap={6}>
        <TagInput
          label="Recipients"
          description="Press Enter or type a comma after each address."
          placeholder="name@example.com"
          value={recipients()}
          onChange={setRecipients}
          maxTags={5}
          addOnBlur
          validate={(tag) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(tag)
              ? undefined
              : `“${tag}” is not an email address.`
          }
        />
        <TagInput
          label="Topics"
          placeholder="Add a topic"
          value={topics()}
          onChange={setTopics}
          separators={[",", " "]}
          normalize={(text) => text.trim().toLowerCase().replace(/^#/u, "")}
          variant="subtle"
        />
        <TagInput label="Archived topics" defaultValue={["2025", "legacy"]} isDisabled />
        <TagInput
          label="Owners"
          isRequired
          isInvalid
          errorMessage="Every project needs an owner."
        />
      </Stack>
    </Grid>
  );
}
