import { Button, ConnectionTestDialog, Inline } from "@barqjs/arc";

import { wait } from "./data.ts";

export default function ConnectionTest() {
  return (
    <Inline gap={3}>
      <ConnectionTestDialog
        heading="Test vault-prod"
        description="Signs in as a run would and, with a reference, reads it. The value is never shown."
        trigger={<Button variant="outline">Test vault-prod</Button>}
        probe={{ label: "Reference", placeholder: "web/stripe#api_key" }}
        onTest={async (reference) => {
          await wait(900);
          if (reference.includes("missing")) {
            return { ok: false, message: `Signed in, but nothing is stored at ${reference}.` };
          }
          return {
            ok: true,
            message: reference === "" ? "Signed in." : `Signed in and read ${reference}.`,
          };
        }}
      />
      <ConnectionTestDialog
        heading="Test the webhook"
        trigger={<Button variant="outline">Test the webhook</Button>}
        onTest={async () => {
          await wait(700);
          throw new Error("hooks.acme.example.com answered 502 Bad Gateway");
        }}
      />
    </Inline>
  );
}
