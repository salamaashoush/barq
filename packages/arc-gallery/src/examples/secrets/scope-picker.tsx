import { createSignal } from "@barqjs/core";
import { Grid, PermissionScopePicker, Stack, scopeSummary } from "@barqjs/arc";

import { SCOPES } from "./data.ts";

export default function ScopePicker() {
  const [scopes, setScopes] = createSignal<readonly string[]>(["checks:read", "checks:write"]);
  return (
    <Grid columns={{ base: 1, lg: 2 }} gap={6}>
      <Stack gap={3}>
        <PermissionScopePicker
          label="Allowed scopes"
          description="Writing a resource includes reading it."
          groups={SCOPES}
          allowed={[
            "checks:read",
            "checks:write",
            "runs:trigger",
            "incidents:read",
            "incidents:write",
          ]}
          isRequired
          value={scopes()}
          onChange={setScopes}
        />
        <p>
          In a table cell: <code>{scopeSummary(scopes(), SCOPES).join(", ") || "none"}</code>
        </p>
      </Stack>
      <Stack gap={6}>
        <PermissionScopePicker
          label="What the agent may do"
          groups={SCOPES.slice(0, 2)}
          audience="agent"
          defaultValue={["checks:read", "runs:trigger"]}
        />
        <PermissionScopePicker
          label="Granted (read only)"
          groups={SCOPES}
          isReadOnly
          defaultValue={["checks:write", "incidents:read"]}
        />
      </Stack>
    </Grid>
  );
}
