import { For } from "@barqjs/core";
import { InlineAlert, Input, Stack, Text, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";
import { BlockEditor, defineBlock } from "@barqjs/arc/editor";
import { Gauge } from "@barqjs/lucide/icons/gauge";
import { ListChecks } from "@barqjs/lucide/icons/list-checks";

const TONES = ["info", "success", "warning", "danger"] as const;
type Tone = (typeof TONES)[number];

export const Callout = defineBlock<{ tone: Tone; text: string }>({
  type: "acme-callout",
  label: "Callout",
  group: "Acme",
  icon: () => <ListChecks />,
  keywords: ["note", "alert"],
  description: "A note in a tone",
  defaultData: () => ({ tone: "info", text: "" }),
  component: (props) => (
    <InlineAlert tone={props.data.tone} title={props.editable ? undefined : props.data.text}>
      <Stack gap={2}>
        {props.editable ? (
          <>
            <Input
              aria-label="Callout text"
              value={props.data.text}
              placeholder="What should readers know?"
              onInput={(event: Event) =>
                props.setData({ text: (event.currentTarget as HTMLInputElement).value })
              }
            />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Tone"
              value={props.data.tone}
              onValueChange={(value: string | string[]) => {
                const tone = TONES.find((one) => one === value);
                if (tone !== undefined) props.setData({ tone });
              }}
            >
              <For each={TONES}>
                {(tone) => <ToggleGroupItem value={tone}>{tone}</ToggleGroupItem>}
              </For>
            </ToggleGroup>
          </>
        ) : null}
      </Stack>
    </InlineAlert>
  ),
  toMarkdown: (data) => `> [!${data.tone.toUpperCase()}] ${data.text}`,
  fromMarkdown: {
    regExp: /^> \[!(INFO|SUCCESS|WARNING|DANGER)\] (.*)$/,
    data: (match) => ({ tone: (match[1] ?? "info").toLowerCase() as Tone, text: match[2] ?? "" }),
  },
});

export const Metric = defineBlock<{ label: string; value: string }>({
  type: "acme-metric",
  label: "Metric",
  group: "Acme",
  icon: () => <Gauge />,
  defaultData: () => ({ label: "Uptime", value: "99.98%" }),
  component: (props) => (
    <Stack gap={0.5}>
      <Text size="xs" color="muted">
        {props.data.label}
      </Text>
      <Text size="lg" weight="strong" numeric>
        {props.data.value}
      </Text>
    </Stack>
  ),
  toMarkdown: (data) => `**${data.label}:** ${data.value}`,
});

const PAGE = `# Q4 reliability review

Acme's platform held its targets this quarter.

> [!SUCCESS] Every service met its 99.9% objective.

## What changed

- Moved billing to the ledger service
- Turned on SSO for Acme Enterprise

## Next

1. Retire the legacy invoice job
2. Add a status page for eu-west-1
`;

export default function BlockEditorExample() {
  return (
    <BlockEditor
      label="Reliability review"
      defaultMarkdown={PAGE}
      extensions={[Callout, Metric]}
      minHeight={360}
      blockPlaceholders={{ paragraph: "Type / for blocks, or just write" }}
    />
  );
}
