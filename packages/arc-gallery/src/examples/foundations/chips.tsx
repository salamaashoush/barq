import { For, createSignal } from "@barqjs/core";
import { Chip, Inline, Stack, TONES, Text } from "@barqjs/arc";
import { Globe } from "@barqjs/lucide/icons/globe";
import { Tag } from "@barqjs/lucide/icons/tag";

const REGIONS = ["Europe", "Middle East", "Americas", "Asia Pacific"];

export default function Chips() {
  const [regions, setRegions] = createSignal<readonly string[]>(["Europe"]);
  const [labels, setLabels] = createSignal<readonly string[]>(["billing", "urgent", "acme"]);
  const [pressed, setPressed] = createSignal(0);
  const toggle = (region: string, on: boolean): void => {
    setRegions(on ? [...regions(), region] : regions().filter((one) => one !== region));
  };
  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Filter chips
        </Text>
        <Inline gap={2} wrap>
          <For each={REGIONS}>
            {(region) => (
              <Chip
                icon={<Globe />}
                selected={regions().includes(region)}
                onSelectedChange={(on: boolean) => toggle(region, on)}
              >
                {region}
              </Chip>
            )}
          </For>
        </Inline>
        <Text size="xs" color="muted">
          Showing {regions().length === 0 ? "every region" : regions().join(", ")}
        </Text>
      </Stack>

      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Input chips
        </Text>
        <Inline gap={2} wrap>
          <For each={labels()}>
            {(label) => (
              <Chip
                icon={<Tag />}
                onRemove={() => setLabels(labels().filter((one) => one !== label))}
              >
                {label}
              </Chip>
            )}
          </For>
          <Chip variant="subtle" onPress={() => setLabels(["billing", "urgent", "acme"])}>
            Reset labels
          </Chip>
        </Inline>
      </Stack>

      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Tones, variants and sizes
        </Text>
        <Inline gap={2} wrap>
          <For each={TONES}>{(tone) => <Chip tone={tone}>{tone}</Chip>}</For>
        </Inline>
        <Inline gap={2} wrap>
          <For each={TONES}>
            {(tone) => (
              <Chip tone={tone} variant="subtle" size="sm">
                {tone}
              </Chip>
            )}
          </For>
        </Inline>
        <Inline gap={2} wrap align="center">
          <Chip onPress={() => setPressed(pressed() + 1)}>Pressed: {pressed()}</Chip>
          <Chip isDisabled>Disabled</Chip>
          <Chip isDisabled defaultSelected onSelectedChange={() => undefined}>
            Disabled and selected
          </Chip>
        </Inline>
      </Stack>
    </Stack>
  );
}
