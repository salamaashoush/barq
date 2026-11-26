import { createSignal } from "@barqjs/core";
import { Code, CopyButton, Inline, Stack, Text } from "@barqjs/arc";

const KEY = "acme_demo_51hacme7kx2";

export default function CopyButtons() {
  const [copies, setCopies] = createSignal(0);
  return (
    <Stack gap={4}>
      <Inline gap={2} align="center">
        <Code>{KEY}</Code>
        <CopyButton value={KEY} label="Copy API key" onCopy={() => setCopies(copies() + 1)} />
      </Inline>
      <Inline gap={2} align="center" wrap>
        <CopyButton value="https://acme.example.com/invite/7f3a" variant="outline" size="sm">
          Copy invite link
        </CopyButton>
        <CopyButton
          value="bun add @barqjs/arc"
          copiedLabel="Command copied"
          resetAfter={4000}
          variant="secondary"
        >
          Copy install command
        </CopyButton>
        <CopyButton value="nothing" disabled label="Copy, unavailable" />
      </Inline>
      <Text size="sm" color="muted">
        The key was copied {copies()} times.
      </Text>
    </Stack>
  );
}
