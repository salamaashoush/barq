import { createSignal } from "@barqjs/core";
import { type ConnectedApp, ConnectedAppsList, Stack } from "@barqjs/arc";

import { NOW } from "../../data/operations.ts";
import { SCOPES, wait } from "./data.ts";

const START: ConnectedApp[] = [
  {
    id: "a1",
    name: "Claude Code",
    source: "on salama-laptop",
    scopes: ["checks:read", "checks:write", "runs:trigger"],
    connectedAt: "2026-10-02T09:00:00Z",
    lastUsedAt: "2026-11-24T08:40:00Z",
    connectedBy: "Salama Ashoush",
  },
  {
    id: "a2",
    name: "Acme deploy bot",
    source: "ci.acme.example.com",
    scopes: ["checks:read", "incidents:write"],
    connectedAt: "2026-09-12T09:00:00Z",
    lastUsedAt: "2026-11-21T22:10:00Z",
    connectedBy: "Salama Ashoush",
  },
  {
    id: "a3",
    name: "Ops dashboard",
    source: "Self-registered, returns to ops.example.com",
    scopes: ["admin"],
    connectedAt: "2026-08-01T09:00:00Z",
    lastUsedAt: null,
    connectedBy: "Salama Ashoush",
    blocked: "Acme allows only the clients on its list.",
  },
];

export default function ConnectedApps() {
  const [apps, setApps] = createSignal<readonly ConnectedApp[]>(START);
  const [allowed, setAllowed] = createSignal(true);
  return (
    <Stack gap={8}>
      <ConnectedAppsList
        apps={apps()}
        now={NOW}
        scopeGroups={SCOPES}
        endpoint="https://acme.example.com/mcp"
        policy={{
          allowed: allowed(),
          onAllowedChange: async (next) => {
            await wait(500);
            setAllowed(next);
          },
          description: "Turning it off stops every connected agent at once.",
        }}
        onDisconnect={async (app) => {
          await wait(400);
          setApps((all) => all.filter((one) => one.id !== app.id));
        }}
      />
      <ConnectedAppsList apps={[]} label="Nothing connected" />
    </Stack>
  );
}
