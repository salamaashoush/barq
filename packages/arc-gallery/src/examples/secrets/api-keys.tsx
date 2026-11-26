import { createSignal } from "@barqjs/core";
import { type ApiKey, ApiKeyManager, Stack } from "@barqjs/arc";

import { NOW } from "../../data/operations.ts";
import { SCOPES, wait } from "./data.ts";

const START: ApiKey[] = [
  {
    id: "k1",
    name: "default",
    prefix: "ak_live_3f",
    scopes: ["checks:read", "checks:write", "runs:trigger"],
    lastUsedAt: "2026-11-24T08:12:00Z",
    expiresAt: "2027-02-01T00:00:00Z",
  },
  {
    id: "k2",
    name: "github-actions",
    prefix: "ak_live_8a",
    scopes: ["runs:trigger"],
    lastUsedAt: "2026-11-23T17:40:00Z",
    expiresAt: null,
  },
  {
    id: "k3",
    name: "old-laptop",
    suffix: "x7Qa",
    scopes: ["admin"],
    lastUsedAt: null,
    expiresAt: "2026-10-01T00:00:00Z",
  },
];

export default function ApiKeys() {
  const [keys, setKeys] = createSignal<readonly ApiKey[]>(START);
  let next = 4;
  return (
    <Stack gap={8}>
      <ApiKeyManager
        keys={keys()}
        now={NOW}
        scopeGroups={SCOPES}
        allowedScopes={["checks:read", "checks:write", "runs:trigger", "incidents:read"]}
        defaultScopes={["checks:read"]}
        createdHint="Store it where the CI job, script or agent can read it. Copy it now; it is not shown again."
        onCreate={async (draft) => {
          await wait(600);
          const key: ApiKey = {
            id: `k${String(next++)}`,
            name: draft.name,
            prefix: "ak_live_9e",
            scopes: draft.scopes,
            lastUsedAt: null,
            expiresAt: draft.expiresAt,
          };
          setKeys((all) => [...all, key]);
          return { secret: "ak_live_9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b", key };
        }}
        revokeOption={(key) =>
          key.name === "default"
            ? { label: "Also remove the 3 runners that joined with it" }
            : undefined
        }
        onRevoke={async (key) => {
          await wait(400);
          setKeys((all) => all.filter((one) => one.id !== key.id));
        }}
      />
      <ApiKeyManager
        keys={[]}
        onCreate={async () => ({ secret: "ak_live_first" })}
        label="No keys yet"
      />
      <ApiKeyManager keys={undefined} label="Loading keys" />
    </Stack>
  );
}
