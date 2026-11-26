import type { Demos } from "../../gallery/types.ts";
import ApiKeys from "./api-keys.tsx";
import apiKeys from "./api-keys.tsx?raw";
import ConnectedApps from "./connected-apps.tsx";
import connectedApps from "./connected-apps.tsx?raw";
import ConnectionTest from "./connection-test.tsx";
import connectionTest from "./connection-test.tsx?raw";
import CredentialBinding from "./credential-binding.tsx";
import credentialBinding from "./credential-binding.tsx?raw";
import ScopePicker from "./scope-picker.tsx";
import scopePicker from "./scope-picker.tsx?raw";
import SecretDisplay from "./secret-display.tsx";
import secretDisplay from "./secret-display.tsx?raw";
import SecretFields from "./secret-fields.tsx";
import secretFields from "./secret-fields.tsx?raw";
import Sessions from "./sessions.tsx";
import sessions from "./sessions.tsx?raw";
import StoredSecrets from "./stored-secrets.tsx";
import storedSecrets from "./stored-secrets.tsx?raw";

export const demos: Demos = {
  "secret-fields": { component: SecretFields, code: secretFields },
  "stored-secrets": { component: StoredSecrets, code: storedSecrets },
  "secret-display": { component: SecretDisplay, code: secretDisplay },
  "scope-picker": { component: ScopePicker, code: scopePicker },
  "credential-binding": { component: CredentialBinding, code: credentialBinding },
  "api-keys": { component: ApiKeys, code: apiKeys },
  sessions: { component: Sessions, code: sessions },
  "connected-apps": { component: ConnectedApps, code: connectedApps },
  "connection-test": { component: ConnectionTest, code: connectionTest },
};
