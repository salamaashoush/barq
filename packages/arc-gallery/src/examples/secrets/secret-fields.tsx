import { createSignal } from "@barqjs/core";
import { FileOrPasteField, Grid, SecretField, Stack } from "@barqjs/arc";

export default function SecretFields() {
  const [token, setToken] = createSignal("");
  const [state, setState] = createSignal("");
  return (
    <Grid columns={{ base: 1, md: 2 }} gap={6}>
      <Stack gap={6}>
        <SecretField
          label="API token"
          description="Read by checks as process.env.API_TOKEN."
          placeholder="Never shown again"
          value={token()}
          onChange={setToken}
        />
        <SecretField
          label="Value"
          multiline="choose"
          description="Paste a key of several lines and it switches by itself."
        />
        <SecretField
          label="Private key"
          multiline
          rows={4}
          defaultValue={
            "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----"
          }
        />
        <SecretField label="Disabled" defaultValue="acme_demo_4ec39hqlyjwdarjt" isDisabled />
      </Stack>
      <Stack gap={6}>
        <FileOrPasteField
          label="Storage state"
          description="Cookies and local storage, as JSON."
          accept={[".json", "application/json"]}
          maxSize={1_000_000}
          placeholder='{ "cookies": [], "origins": [] }'
          value={state()}
          onChange={setState}
        />
        <FileOrPasteField
          label="Certificate"
          accept={[".pem", ".crt"]}
          rows={4}
          placeholder="-----BEGIN CERTIFICATE-----"
          errorMessage="This is not a PEM certificate."
          defaultValue="not a certificate"
        />
      </Stack>
    </Grid>
  );
}
