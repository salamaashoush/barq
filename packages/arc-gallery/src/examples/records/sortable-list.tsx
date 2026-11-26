import { createSignal } from "@barqjs/core";
import { List, ListItem, Stack, Text, reorderItems } from "@barqjs/arc";
import { Flag } from "@barqjs/lucide/icons/flag";

interface Component {
  id: string;
  name: string;
  detail: string;
}

const COMPONENTS: Component[] = [
  { id: "api", name: "Public API", detail: "api.example.com" },
  { id: "web", name: "Dashboard", detail: "app.example.com" },
  { id: "checkout", name: "Checkout", detail: "pay.example.com" },
  { id: "email", name: "Email delivery", detail: "Through the mail relay" },
  { id: "webhooks", name: "Webhooks", detail: "Outgoing deliveries" },
  { id: "search", name: "Search", detail: "Indexing and queries" },
  { id: "status", name: "Status page", detail: "status.example.com" },
];

export default function SortableListExample() {
  const [components, setComponents] = createSignal(COMPONENTS);
  const [goals, setGoals] = createSignal([
    { id: "g1", name: "Cut checkout errors under 0.1%" },
    { id: "g2", name: "Page in under a minute" },
    { id: "g3", name: "Publish every postmortem" },
  ]);
  return (
    <Stack gap={8}>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Drag by the handle, Enter on it to move from the keyboard, or the arrows
        </Text>
        <List<Component>
          aria-label="Status page components"
          items={components()}
          getTextValue={(component) => component.name}
          moveButtons
          virtual={{ rowHeight: 56, height: "18rem" }}
          onReorder={(event) => setComponents(reorderItems(components(), event))}
        >
          {(component) => <ListItem title={component.name} description={component.detail} />}
        </List>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Drag only, no rules
        </Text>
        <List
          aria-label="Quarter goals"
          items={goals()}
          divided={false}
          onReorder={(event) => setGoals(reorderItems(goals(), event))}
        >
          {(goal) => <ListItem title={goal.name} media={<Flag />} />}
        </List>
      </Stack>
    </Stack>
  );
}
