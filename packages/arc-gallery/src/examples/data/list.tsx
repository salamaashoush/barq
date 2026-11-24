import { createSignal } from "@barqjs/core";
import {
  Bytes,
  EmptyState,
  Grid,
  IconButton,
  List,
  ListItem,
  PersonAvatar,
  RelativeTime,
  Stack,
  Text,
  toast,
} from "@barqjs/arc";
import { Download } from "@barqjs/lucide/icons/download";
import { FileSpreadsheet } from "@barqjs/lucide/icons/file-spreadsheet";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Inbox } from "@barqjs/lucide/icons/inbox";

import { NOW } from "../../data/operations.ts";

interface Report {
  id: string;
  name: string;
  size: number;
  sheet: boolean;
  updated: string;
}

const REPORTS: Report[] = [
  {
    id: "r1",
    name: "Q3 revenue by region.xlsx",
    size: 284_000,
    sheet: true,
    updated: "2026-11-24T07:10:00Z",
  },
  {
    id: "r2",
    name: "Incident review, checkout latency.pdf",
    size: 1_240_000,
    sheet: false,
    updated: "2026-11-23T15:00:00Z",
  },
  {
    id: "r3",
    name: "Churn cohorts.xlsx",
    size: 96_000,
    sheet: true,
    updated: "2026-11-20T10:30:00Z",
  },
  {
    id: "r4",
    name: "Security audit 2026.pdf",
    size: 3_800_000,
    sheet: false,
    updated: "2026-11-02T09:00:00Z",
  },
];

const PEOPLE = [
  { id: "salama", name: "Salama", email: "salama@example.com", role: "Owner" },
  { id: "lina", name: "Lina", email: "lina@example.com", role: "Admin" },
  { id: "omar", name: "Omar", email: "omar@example.com", role: "Member" },
  { id: "maya", name: "Maya", email: "maya@example.com", role: "Member" },
];

export default function ListExample() {
  const [chosen, setChosen] = createSignal<"all" | Set<string | number>>(new Set(["lina"]));

  function count() {
    const keys = chosen();
    return keys === "all" ? PEOPLE.length : keys.size;
  }

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Opened with Enter or a press, actions kept as their own controls
        </Text>
        <List
          aria-label="Reports"
          items={REPORTS}
          getTextValue={(report) => report.name}
          onAction={(key) => toast(`Opening ${String(key)}`)}
        >
          {(report: Report) => (
            <ListItem
              media={report.sheet ? <FileSpreadsheet /> : <FileText />}
              title={report.name}
              description={<RelativeTime value={report.updated} now={NOW} />}
              meta={<Bytes value={report.size} />}
              actions={
                <IconButton
                  label={`Download ${report.name}`}
                  size="sm"
                  variant="ghost"
                  onPress={() => toast.success(`Downloading ${report.name}`)}
                >
                  <Download />
                </IconButton>
              }
            />
          )}
        </List>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Several selected, one disabled
        </Text>
        <List
          aria-label="Workspace members"
          items={PEOPLE}
          getTextValue={(person) => person.name}
          selectionMode="multiple"
          selectedKeys={chosen()}
          onSelectionChange={setChosen}
          disabledKeys={["salama"]}
        >
          {(person: (typeof PEOPLE)[number]) => (
            <ListItem
              media={<PersonAvatar person={{ name: person.name }} size="sm" />}
              mediaVariant="default"
              title={person.name}
              description={person.email}
              meta={person.role}
            />
          )}
        </List>
        <Text size="sm" color="muted">
          {count()} chosen
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Empty
        </Text>
        <List
          aria-label="Shared with you"
          items={[] as Report[]}
          empty={
            <EmptyState
              icon={<Inbox />}
              heading="Nothing shared yet"
              description="Files others share with you land here."
            />
          }
        >
          {(report: Report) => <ListItem title={report.name} />}
        </List>
      </Stack>
    </Grid>
  );
}
