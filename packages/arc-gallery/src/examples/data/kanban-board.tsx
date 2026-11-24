import { createSignal } from "@barqjs/core";
import {
  Badge,
  KanbanBoard,
  type KanbanColumn,
  ListItem,
  PersonAvatar,
  Stack,
  Text,
  applyKanbanMove,
  toast,
} from "@barqjs/arc";

interface Task {
  id: string;
  title: string;
  key: string;
  owner: string;
  priority: "High" | "Normal";
}

function task(
  id: number,
  title: string,
  owner: string,
  priority: Task["priority"] = "Normal",
): Task {
  return {
    id: `task-${id}`,
    title,
    key: `ACM-${id}`,
    owner,
    priority,
  };
}

const START: KanbanColumn<Task>[] = [
  {
    id: "todo",
    title: "To do",
    items: [
      task(214, "Rotate the payments API keys", "Lina", "High"),
      task(219, "Write the SSO setup guide", "Maya"),
      task(221, "Archive last year's invoices", "Jonas"),
    ],
  },
  {
    id: "doing",
    title: "In progress",
    limit: 2,
    items: [
      task(208, "Move the status page to the new host", "Salama", "High"),
      task(211, "Tune search ranking", "Omar"),
    ],
  },
  {
    id: "review",
    title: "In review",
    items: [task(203, "Retry failed webhooks with backoff", "Lina")],
  },
  { id: "done", title: "Done", items: [task(198, "Ship dark mode for the dashboard", "Salama")] },
];

export default function KanbanBoardExample() {
  const [columns, setColumns] = createSignal(START);
  const [next, setNext] = createSignal(230);

  function add(column: string) {
    const created = task(next(), "Untitled task", "Salama");
    setNext((n) => n + 1);
    setColumns((all) =>
      all.map((each) => (each.id === column ? { ...each, items: [...each.items, created] } : each)),
    );
  }

  return (
    <Stack gap={3}>
      <KanbanBoard
        aria-label="Sprint 42"
        columns={columns()}
        onMove={(event) => setColumns((all) => applyKanbanMove(all, event))}
        onAddCard={add}
        onAction={(key) => toast(`Opened ${String(key).replace("task-", "ACM-")}`)}
        defaultCollapsed={["done"]}
      >
        {(item: Task) => (
          <ListItem
            title={item.title}
            description={item.key}
            media={<PersonAvatar person={{ name: item.owner }} size="sm" />}
            meta={item.priority === "High" ? <Badge variant="destructive">High</Badge> : undefined}
          />
        )}
      </KanbanBoard>
      <Text size="sm" color="muted">
        Drag a card, or focus its drag button and press Enter, the arrows, then Enter. In progress
        holds two before its count warns.
      </Text>
    </Stack>
  );
}
