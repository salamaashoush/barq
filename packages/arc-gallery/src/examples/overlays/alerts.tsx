import { For, Show, createSignal } from "@barqjs/core";
import { Banner, Button, InlineAlert, Stack, TONES, type Tone } from "@barqjs/arc";

const MESSAGES: Record<Tone, { title: string; body: string }> = {
  success: { title: "Payment received", body: "Invoice #1042 is paid in full." },
  warning: { title: "Card expires soon", body: "Update the card ending 4242 before December." },
  danger: { title: "Deploy failed", body: "The build stopped at step 3 of 5. Logs are attached." },
  info: {
    title: "Maintenance on Sunday",
    body: "The API answers slowly between 02:00 and 03:00 UTC.",
  },
  neutral: { title: "Read-only workspace", body: "An admin paused changes while the audit runs." },
};

export default function Alerts() {
  const [dismissed, setDismissed] = createSignal<ReadonlySet<Tone>>(new Set());
  const [banner, setBanner] = createSignal(true);
  return (
    <Stack gap={3}>
      <Show when={banner()}>
        <Banner
          tone="info"
          title="A new billing page is here"
          actions={
            <Button size="sm" variant="outline">
              Take a look
            </Button>
          }
          onDismiss={() => setBanner(false)}
        >
          Plans, invoices and usage now live in one place.
        </Banner>
      </Show>
      <For each={TONES}>
        {(tone) => (
          <Show when={!dismissed().has(tone)}>
            <InlineAlert
              tone={tone}
              title={MESSAGES[tone].title}
              onDismiss={() => setDismissed(new Set([...dismissed(), tone]))}
            >
              {MESSAGES[tone].body}
            </InlineAlert>
          </Show>
        )}
      </For>
      <InlineAlert tone="warning" icon={null} live="none">
        No icon and no title, only the words.
      </InlineAlert>
      <Button
        variant="ghost"
        size="sm"
        isDisabled={dismissed().size === 0 && banner()}
        onPress={() => {
          setDismissed(new Set<Tone>());
          setBanner(true);
        }}
      >
        Bring them back
      </Button>
    </Stack>
  );
}
