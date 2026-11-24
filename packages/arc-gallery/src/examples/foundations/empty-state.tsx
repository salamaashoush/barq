import { createSignal } from "@barqjs/core";
import { Button, EmptyState, Grid } from "@barqjs/arc";
import { FolderPlus } from "@barqjs/lucide/icons/folder-plus";
import { SearchX } from "@barqjs/lucide/icons/search-x";

export default function EmptyStates() {
  const [created, setCreated] = createSignal(0);
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={4}>
      <EmptyState
        variant="outline"
        icon={<FolderPlus />}
        heading="No projects yet"
        description={
          created() === 0
            ? "Projects hold your checks, alerts and status pages."
            : `${String(created())} project draft started. Finish it from the list.`
        }
        actions={
          <>
            <Button onPress={() => setCreated(created() + 1)}>New project</Button>
            <Button variant="outline">Import</Button>
          </>
        }
      />
      <EmptyState
        icon={<SearchX />}
        heading="Nothing matches “acme-eu”"
        description="Try a shorter search, or clear the filters."
        actions={<Button variant="ghost">Clear filters</Button>}
      />
    </Grid>
  );
}
