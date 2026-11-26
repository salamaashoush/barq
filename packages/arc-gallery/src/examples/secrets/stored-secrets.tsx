import { createSignal } from "@barqjs/core";
import {
  CopyableField,
  Grid,
  SecretReferenceField,
  Stack,
  StoredSecretField,
  useArcForm,
} from "@barqjs/arc";

const SECRETS = ["CORP_CA", "CLIENT_CERT", "CLIENT_KEY", "STRIPE_KEY"];

export default function StoredSecrets() {
  const [signing, setSigning] = createSignal<string | null>("");
  const form = useArcForm(() => ({
    defaultValues: { address: "https://vault.acme.example.com", token: "" },
  }));
  const address = form.useSelector((state) => state.values.address);
  return (
    <Grid columns={{ base: 1, md: 2 }} gap={6}>
      <Stack gap={6}>
        <StoredSecretField
          label="Signing secret"
          stored={{ hint: "x7Qa", since: "2026-03-14T10:00:00Z" }}
          forgettable
          forgetLabel="Stop signing"
          forgottenText="Requests go unsigned once you save."
          keepLabel="Keep the secret"
          value={signing()}
          onChange={setSigning}
        />
        <p>
          Sends:{" "}
          <code>
            {signing() === null
              ? "null (forget)"
              : signing() === ""
                ? "nothing (keep)"
                : "the new secret"}
          </code>
        </p>
        <StoredSecretField
          label="Anthropic key"
          isRequired
          description="Billed to the organization."
        />
        <form.AppForm>
          <Stack gap={4}>
            <form.AppField name="address">
              {(field) => <field.TextField label="Vault address" type="url" />}
            </form.AppField>
            <form.AppField name="token">
              {(field) => (
                <field.StoredSecretField
                  label="Vault token"
                  stored={{ hint: "9f2c" }}
                  mustReenter={address() !== "https://vault.acme.example.com"}
                />
              )}
            </form.AppField>
          </Stack>
        </form.AppForm>
      </Stack>
      <Stack gap={6}>
        <SecretReferenceField label="Client key" secrets={SECRETS} defaultValue="{{CLIENT_KEY}}" />
        <SecretReferenceField
          label="Trusted CA"
          secrets={SECRETS}
          defaultValue="{{OLD_CA}}"
          description="A reference to a secret that was renamed stays in view."
        />
        <SecretReferenceField label="Proxy password" secrets={[]} noneLabel="No password" />
        <CopyableField
          label="Location ID"
          value="eu-west-private"
          description="What the CLI, deploy files and the API call it. It never changes."
        />
        <CopyableField
          label="Webhook URL"
          value="https://hooks.acme.example.com/in/7f3k29xd"
          mono={false}
        />
      </Stack>
    </Grid>
  );
}
