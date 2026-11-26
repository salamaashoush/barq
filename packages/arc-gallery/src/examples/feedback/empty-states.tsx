import { createSignal } from "@barqjs/core";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Grid,
  Stack,
} from "@barqjs/arc";
import { Inbox } from "@barqjs/lucide/icons/inbox";

export default function EmptyStates() {
  const [query, setQuery] = createSignal("status:flaky owner:payments");
  return (
    <Stack gap={4}>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <EmptyState
          variant="outline"
          icon={<Inbox />}
          heading="No incidents yet"
          description="They open here when a check fails twice in a row."
          actions={<Button>Create a check</Button>}
        />
        <EmptyState
          variant="outline"
          kind="filtered"
          description={query() === "" ? undefined : `Nothing matches “${query()}”.`}
          onClearFilters={() => setQuery("")}
        />
        <EmptyState
          variant="outline"
          kind="restricted"
          grantedBy={["Salama", "the project's admins"]}
        />
        <EmptyState
          variant="outline"
          kind="done"
          heading="All caught up"
          description="Every run in this suite has been reviewed."
        />
      </Grid>
      <Card>
        <CardHeader>
          <CardTitle>Runners</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <EmptyState placement="section" heading="No runners connected yet" />
            <EmptyState
              placement="section"
              kind="restricted"
              heading="Only admins see the runners"
              grantedBy={["Salama"]}
            />
            <EmptyState placement="section" kind="filtered" onClearFilters={() => setQuery("")} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
