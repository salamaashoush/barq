import { Show, createSignal } from "@barqjs/core";
import {
  Button,
  Grid,
  MaskedValue,
  OneTimeSecret,
  RedactedSecret,
  RedactedText,
  Stack,
} from "@barqjs/arc";

import { wait } from "./data.ts";

const LOG = [
  "page.fill('#email', <secret>SHOP_EMAIL</secret>)",
  "page.fill('#password', <secret>SHOP_PASSWORD</secret>)",
  "Set-Cookie: session=[redacted]",
];

export default function SecretDisplay() {
  const [stored, setStored] = createSignal(false);
  return (
    <Grid columns={{ base: 1, md: 2 }} gap={6}>
      <Stack gap={4}>
        <p>
          Passport number:{" "}
          <MaskedValue
            label="the passport number"
            masked="•••• 4821"
            reveal={async () => {
              await wait(500);
              return "A12384821";
            }}
          />
        </p>
        <p>
          Token:{" "}
          <MaskedValue
            label="the token"
            value="acme_demo_4ec39hqlyjwdarjt"
            hideAfter={10_000}
          />
        </p>
        <p>
          National ID:{" "}
          <MaskedValue label="the national ID" masked="••• ••• 019" canReveal={false} />
        </p>
        <p>
          Refused:{" "}
          <MaskedValue
            label="the bank account"
            masked="•••• 7731"
            reveal={() => Promise.reject(new Error("only finance may see this"))}
          />
        </p>
        <Stack gap={1}>
          {LOG.map((line) => (
            <code>
              <RedactedText
                text={line}
                pattern={/<secret>(\w+)<\/secret>|\[redacted\]/g}
                reason={(name) =>
                  name === undefined
                    ? "Set by the site, removed by the runner"
                    : `The value of ${name}, removed by the runner`
                }
              />
            </code>
          ))}
        </Stack>
        <p>
          A marker alone: <RedactedSecret name="DATABASE_URL" reason="Never written to logs" />
        </p>
      </Stack>
      <Stack gap={4}>
        <OneTimeSecret
          heading="Key k8s-prod"
          value="ak_live_9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d"
          hint="Store it as a secret wherever runners start. Copy it now; it is not shown again."
          expiresAt="2027-02-24T00:00:00Z"
        />
        <Show
          when={!stored()}
          fallback={
            <Button variant="outline" onPress={() => setStored(false)}>
              Show the codes again
            </Button>
          }
        >
          <OneTimeSecret
            tone="warning"
            heading="Recovery codes"
            value={"3f9a-2c7d\n8b1e-5a40\nc6d2-91f8\n0e7b-4d3a"}
            hint="Each signs you in once if you lose your phone."
            onDone={() => setStored(true)}
          />
        </Show>
      </Stack>
    </Grid>
  );
}
