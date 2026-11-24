import { For, createSignal } from "@barqjs/core";
import {
  Badge,
  DataViews,
  Grid,
  Input,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  ViewSwitcher,
} from "@barqjs/arc";
import { gap, layout, space, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { LayoutGrid } from "@barqjs/lucide/icons/layout-grid";
import { List } from "@barqjs/lucide/icons/list";
import { Table2 } from "@barqjs/lucide/icons/table-2";

import { PROJECTS } from "../../data/people.ts";

const demo = layer("demo");
const card = demo(surface.card, layout.column, gap[2], { padding: space.x3 });
const listRow = demo(layout.row, layout.between, gap[3], { paddingBlock: space.x2 });

const STATUS = [
  "On track",
  "At risk",
  "Done",
  "On track",
  "Planning",
  "On track",
  "Done",
  "At risk",
];

export default function ViewSwitcherExample() {
  const [query, setQuery] = createSignal("");
  const [range, setRange] = createSignal("week");
  function projects() {
    return PROJECTS.map((project, index) => ({
      ...project,
      status: STATUS[index] ?? "On track",
    })).filter((project) => project.name.toLowerCase().includes(query().toLowerCase()));
  }

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          ViewSwitcher on its own, icons only: {range()}
        </Text>
        <ViewSwitcher
          aria-label="Calendar range"
          iconOnly
          view={range()}
          onViewChange={setRange}
          views={[
            { id: "day", label: "Day", icon: Calendar },
            { id: "week", label: "Week", icon: LayoutGrid },
            { id: "list", label: "Agenda", icon: List },
          ]}
        />
      </Stack>
      <DataViews
        aria-label="Projects"
        param="projects-view"
        toolbar={
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects"
            value={query()}
            onInput={(event: Event) => {
              setQuery((event.currentTarget as HTMLInputElement).value);
            }}
          />
        }
        views={[
          {
            id: "list",
            label: "List",
            icon: List,
            content: () => (
              <div>
                <For each={projects()}>
                  {(project) => (
                    <div class={listRow}>
                      <Text weight="medium">{project.name}</Text>
                      <Badge variant="secondary">{project.status}</Badge>
                    </div>
                  )}
                </For>
              </div>
            ),
          },
          {
            id: "cards",
            label: "Cards",
            icon: LayoutGrid,
            content: () => (
              <Grid minItemWidth="12rem" gap={3}>
                <For each={projects()}>
                  {(project) => (
                    <div class={card}>
                      <Text size="xs" mono color="muted">
                        {project.key}
                      </Text>
                      <Text weight="medium">{project.name}</Text>
                      <Badge variant="outline">{project.status}</Badge>
                    </div>
                  )}
                </For>
              </Grid>
            ),
          },
          {
            id: "table",
            label: "Table",
            icon: Table2,
            content: () => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={projects()}>
                    {(project) => (
                      <TableRow>
                        <TableCell>{project.key}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell>{project.status}</TableCell>
                      </TableRow>
                    )}
                  </For>
                </TableBody>
              </Table>
            ),
          },
        ]}
      />
    </Stack>
  );
}
