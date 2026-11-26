import { createSignal } from "@barqjs/core";
import { type CredentialBindings, CredentialBindingList, Stack } from "@barqjs/arc";

const KEPT = [
  { name: "SHOP_EMAIL", origin: "from the field 'Email' on shop.example.com" },
  { name: "SHOP_PASSWORD", origin: "from the field 'Password' on shop.example.com" },
  { name: "OTP_SEED", origin: "from the field 'One-time code' on shop.example.com" },
];

export default function CredentialBinding() {
  const [bindings, setBindings] = createSignal<CredentialBindings>({});
  return (
    <Stack gap={6}>
      <CredentialBindingList
        label="Recorded secrets"
        description="The recording kept these out of its steps. Choose where a check made from it reads each."
        credentials={KEPT}
        existing={["SHOP_EMAIL", "STAGING_PASSWORD"]}
        canCapture
        scopes={[
          { value: "staging", label: "Staging" },
          { value: "production", label: "Production" },
        ]}
        everyScopeLabel="Every environment"
        value={bindings()}
        onChange={setBindings}
      />
      <CredentialBindingList
        label="Without saving recorded values"
        credentials={KEPT.slice(1, 2)}
        existing={[]}
      />
      <CredentialBindingList
        label="Kept (read only)"
        credentials={KEPT}
        existing={["SHOP_EMAIL"]}
        canCapture
        isReadOnly
      />
    </Stack>
  );
}
