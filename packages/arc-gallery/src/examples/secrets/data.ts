import type { ScopeGroup } from "@barqjs/arc";

export const SCOPES: readonly ScopeGroup[] = [
  {
    label: "Checks",
    scopes: [
      {
        value: "checks:read",
        description: "Projects, checks, runs, reports and secret names.",
        agentDescription: "Read checks, runs and their failing tests.",
      },
      {
        value: "checks:write",
        description: "Create, change and delete checks; deploy.",
        agentDescription: "Write checks, test them before saving, and deploy.",
        implies: ["checks:read"],
      },
      {
        value: "runs:trigger",
        description: "Run checks now, alone or in batches.",
        agentDescription: "Run checks now.",
        implies: ["checks:read"],
      },
    ],
  },
  {
    label: "Incidents",
    scopes: [
      { value: "incidents:read", description: "Incidents and their timelines." },
      {
        value: "incidents:write",
        description: "Open, acknowledge, resolve and comment.",
        implies: ["incidents:read"],
      },
    ],
  },
  {
    label: "Secrets",
    scopes: [{ value: "secrets:write", description: "Add, change and delete secrets." }],
  },
  {
    label: "Admin",
    scopes: [
      {
        value: "admin",
        description: "Everything, members, keys and single sign-on included.",
        impliesAll: true,
      },
    ],
  },
];

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
