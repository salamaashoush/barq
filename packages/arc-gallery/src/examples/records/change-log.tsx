import { type ChangeEntry, ChangeLog, Link, Stack, Text } from "@barqjs/arc";

import { NOW } from "./data.ts";

const SALAMA = { id: "u1", name: "Salama Ashoush" };
const ANA = { id: "u2", name: "Ana Lima" };
const DEPLOYER = { id: "k1", name: "Deploy key", system: true };

const ENTRIES: ChangeEntry[] = [
  {
    id: "c1",
    actor: SALAMA,
    action: "changed the plan of",
    target: <Link href="#billing">Billing</Link>,
    time: "2026-03-04T09:30:00.000Z",
    reason: "Moved to annual billing after the renewal call.",
    changes: [
      { field: "Plan", before: "Team", after: "Business" },
      { field: "Seats", before: "12", after: "25" },
    ],
  },
  {
    id: "c2",
    actor: ANA,
    action: "edited the contact",
    target: <Link href="#contact">سلمى حسن</Link>,
    time: "2026-03-04T08:10:00.000Z",
    changes: [
      { field: "Name", before: "Salma Hassan", after: "سلمى حسن" },
      { field: "Phone", before: null, after: "+20 100 123 4567", ltr: true },
      { field: "Notes", before: "Prefers email", after: null },
    ],
  },
  {
    id: "c3",
    actor: DEPLOYER,
    action: "rotated the signing secret",
    time: "2026-03-03T22:00:00.000Z",
  },
  {
    id: "c4",
    actor: ANA,
    action: "invited",
    target: "dina@example.com",
    time: "2026-02-26T14:20:00.000Z",
    changes: [{ field: "Role", before: null, after: "Editor" }],
  },
  {
    id: "c5",
    action: "archived 14 runs older than 90 days",
    time: "2026-02-20T03:00:00.000Z",
  },
];

export default function ChangeLogExample() {
  return (
    <Stack gap={8}>
      <ChangeLog entries={ENTRIES} timeZone="UTC" now={NOW} onLoadMore={() => {}} />
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Narrowed on the server, with nothing found
        </Text>
        <ChangeLog
          entries={[]}
          manualFiltering
          defaultFilter={{ actors: ["u1"], range: null }}
          actors={[SALAMA, ANA]}
          empty="No changes by Salama Ashoush yet."
        />
      </Stack>
    </Stack>
  );
}
