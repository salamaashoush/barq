import { createSignal } from "@barqjs/core";
import { type ActiveSession, ActiveSessionsList, Stack } from "@barqjs/arc";

import { NOW } from "../../data/operations.ts";
import { wait } from "./data.ts";

const START: ActiveSession[] = [
  {
    id: "s1",
    client: "Firefox 133 on macOS",
    location: "Cairo, Egypt",
    address: "203.0.113.4",
    lastActiveAt: NOW,
    current: true,
  },
  {
    id: "s2",
    client: "Safari on iPhone",
    device: "phone",
    location: "Alexandria, Egypt",
    address: "198.51.100.23",
    lastActiveAt: "2026-11-23T19:02:00Z",
  },
  {
    id: "s3",
    client: "Chrome 131 on an iPad",
    device: "tablet",
    location: "Berlin, Germany",
    lastActiveAt: "2026-11-20T08:15:00Z",
  },
  {
    id: "s4",
    client: "acme CLI 2.4.1",
    device: "terminal",
    address: "192.0.2.10",
    lastActiveAt: "2026-11-11T13:00:00Z",
  },
];

export default function Sessions() {
  const [sessions, setSessions] = createSignal<readonly ActiveSession[]>(START);
  return (
    <Stack gap={8}>
      <ActiveSessionsList
        sessions={sessions()}
        now={NOW}
        onRevoke={async (session) => {
          await wait(400);
          setSessions((all) => all.filter((one) => one.id !== session.id));
        }}
        onRevokeOthers={async () => {
          await wait(600);
          setSessions((all) => all.filter((one) => one.current === true));
        }}
      />
      <ActiveSessionsList sessions={undefined} label="Loading sessions" />
      <ActiveSessionsList
        sessions={[]}
        label="Sessions that failed to load"
        error={{ message: "The server did not answer.", requestId: "req_7f3k29" }}
        onRetry={() => wait(800)}
      />
    </Stack>
  );
}
