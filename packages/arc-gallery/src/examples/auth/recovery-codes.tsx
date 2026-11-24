import { createSignal } from "@barqjs/core";
import { Container, InlineAlert, RecoveryCodes, Stack } from "@barqjs/arc";

const CODES = [
  "acme-7f3k-29xd",
  "acme-q81m-p0zr",
  "acme-4ht6-wn2c",
  "acme-l9v2-8bqe",
  "acme-x3cy-5jur",
  "acme-m0pa-k7td",
  "acme-6wqs-1fne",
  "acme-r2zb-h4lo",
];

export default function RecoveryCodesExample() {
  const [saved, setSaved] = createSignal(false);

  return (
    <Container size="sm">
      <Stack gap={4}>
        <RecoveryCodes
          codes={CODES}
          filename="acme-recovery-codes.txt"
          onConfirm={() => setSaved(true)}
        />
        {saved() ? (
          <InlineAlert tone="success" title="Two-factor authentication is on">
            Keep the codes somewhere other than this device.
          </InlineAlert>
        ) : null}
      </Stack>
    </Container>
  );
}
