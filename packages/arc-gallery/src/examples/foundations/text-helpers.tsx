import { For, createSignal } from "@barqjs/core";
import { HighlightMatches, Inline, Input, Shortcut, Stack, Text, Truncate } from "@barqjs/arc";

const PROJECTS = [
  "Acme billing migration",
  "Résumé builder for the careers site",
  "Billing dashboard redesign",
  "Data export to example.com",
];

export default function TextHelpers() {
  const [query, setQuery] = createSignal("bill");
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text weight="medium">Truncate</Text>
        <Truncate>
          The Acme renewal note: seat count, the October discount, the new billing contact at
          example.com and the countersigning deadline at the end of the quarter.
        </Truncate>
        <Truncate lines={2} moreLabel="Read more" lessLabel="Read less">
          Two lines and then a button. Salama asked for the migration to run over the weekend, so
          the on-call rota was moved and Lina takes Saturday while Omar covers Sunday. The status
          page goes into maintenance at 22:00 UTC and the export endpoints answer 503 until the job
          finishes.
        </Truncate>
        <Truncate expandable={false}>
          Not expandable: the whole text becomes the element's title while it is cut, so a pointer
          can still read it by resting on it.
        </Truncate>
      </Stack>

      <Stack gap={2}>
        <Text weight="medium">Shortcut</Text>
        <Inline gap={4} align="center" wrap>
          <Shortcut keys={["Mod", "K"]} />
          <Shortcut keys="Mod+Shift+P" />
          <Shortcut keys={["Alt", "Enter"]} variant="outline" />
          <Shortcut keys="Escape" size="sm" />
          <Shortcut keys={["Ctrl", "Z"]} separator=" then " size="sm" variant="outline" />
        </Inline>
      </Stack>

      <Stack gap={2}>
        <Text weight="medium">HighlightMatches</Text>
        <Input
          aria-label="Search projects"
          value={query()}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
        <Stack gap={1}>
          <For each={PROJECTS}>
            {(name) => (
              <Text>
                <HighlightMatches text={name} query={query()} />
              </Text>
            )}
          </For>
          <Text color="muted">
            <HighlightMatches
              text="Ranges from a search service"
              ranges={[
                [0, 6],
                [14, 20],
              ]}
            />
          </Text>
        </Stack>
      </Stack>
    </Stack>
  );
}
