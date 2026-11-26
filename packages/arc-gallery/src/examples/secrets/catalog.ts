import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "secrets",
  title: "Keys and secrets",
  description:
    "Secrets typed, stored, referenced and shown once; API keys, sessions and connected applications; scopes to grant, where each secret comes from, and a connection tested without revealing anything.",
  examples: [
    {
      id: "secret-fields",
      title: "Secret fields",
      description:
        "A one-line secret, a private key over several lines, a field that chooses, and a pasted file read in place.",
      covers: ["SecretField", "FileOrPasteField"],
    },
    {
      id: "stored-secrets",
      title: "Stored secrets",
      description:
        "A secret the server keeps and never shows: how it ends and since when, left blank to keep it, forgotten with an undo, typed again once where it goes changes, and a reference to a stored secret.",
      covers: ["StoredSecretField", "SecretReferenceField", "CopyableField"],
    },
    {
      id: "secret-display",
      title: "Masked, shown once and redacted",
      description:
        "A value shown to a reader allowed to see it and fetched only then, a secret shown once with Done held until it is stored, and log text with its secrets taken out.",
      covers: ["MaskedValue", "OneTimeSecret", "RedactedText", "RedactedSecret"],
    },
    {
      id: "scope-picker",
      title: "Scopes to grant",
      description:
        "Scopes grouped by resource, those beyond the reader's role disabled with why, an agent's wording, and the set said briefly.",
      covers: ["PermissionScopePicker", "scopeSummary"],
    },
    {
      id: "credential-binding",
      title: "Where each secret comes from",
      description:
        "Each secret a recording kept out bound to the captured value, a stored secret or a typed one, with where it is saved and what is still missing.",
      covers: ["CredentialBindingList"],
    },
    {
      id: "api-keys",
      title: "API keys",
      description:
        "Keys with what tells them apart, their scopes, use and expiry; one made with a free name and shown once; revoked after a question that can remove what joined with it.",
      covers: ["ApiKeyManager", "OneTimeSecret"],
    },
    {
      id: "sessions",
      title: "Signed-in sessions",
      description:
        "Everywhere a person is signed in, this device marked, each signed out on its own and the rest at once after a question, loading and failed.",
      covers: ["ActiveSessionsList"],
    },
    {
      id: "connected-apps",
      title: "Connected applications",
      description:
        "Agents and integrations acting for people, one blocked by policy, the switch that allows them and the address they connect at.",
      covers: ["ConnectedAppsList"],
    },
    {
      id: "connection-test",
      title: "Test a connection",
      description:
        "A dialog that signs in as real use would, reads one reference if asked, and keeps its outcome in view for another try.",
      covers: ["ConnectionTestDialog"],
    },
  ],
};
