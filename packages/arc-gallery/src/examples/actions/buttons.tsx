import { For, createSignal } from "@barqjs/core";
import { Button, Inline, Spinner, Stack, Text } from "@barqjs/arc";
import { Download } from "@barqjs/lucide/icons/download";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Send } from "@barqjs/lucide/icons/send";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const SIZES = ["xs", "sm", "default", "lg"] as const;

export default function Buttons() {
  const [sending, setSending] = createSignal(false);
  const [sent, setSent] = createSignal(0);
  const send = (): void => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(sent() + 1);
    }, 1500);
  };
  return (
    <Stack gap={6}>
      <Inline gap={2} wrap align="center">
        <For each={VARIANTS}>{(variant) => <Button variant={variant}>{variant}</Button>}</For>
      </Inline>
      <Inline gap={2} wrap align="center">
        <For each={SIZES}>
          {(size) => (
            <Button size={size} variant="outline">
              <Plus />
              Size {size}
            </Button>
          )}
        </For>
      </Inline>
      <Inline gap={2} wrap align="center">
        <Button>
          <Download />
          Export CSV
        </Button>
        <Button variant="secondary">
          Continue
          <Send />
        </Button>
        <Button variant="destructive">
          <Trash2 />
          Delete project
        </Button>
        <Button variant="outline" href="https://example.com/docs" target="_blank" rel="noreferrer">
          Read the docs
        </Button>
        <Button isDisabled>Disabled</Button>
        <Button variant="outline" isDisabled>
          Outline disabled
        </Button>
      </Inline>
      <Inline gap={3} wrap align="center">
        <Button isPending={sending()} onPress={send}>
          {sending() ? <Spinner /> : <Send />}
          {sending() ? "Sending" : "Send invoice"}
        </Button>
        <Text size="sm" color="muted" aria-live="polite">
          {sent() === 0
            ? "Nothing sent yet."
            : `Sent ${String(sent())} time${sent() === 1 ? "" : "s"}.`}
        </Text>
      </Inline>
    </Stack>
  );
}
