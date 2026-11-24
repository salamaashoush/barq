import { Breadcrumbs, Stack, Text } from "@barqjs/arc";

export default function BreadcrumbTrails() {
  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Text size="xs" color="muted">
          From the route's own crumbs, as the app shell draws them
        </Text>
        <Breadcrumbs />
      </Stack>
      <Stack gap={1}>
        <Text size="xs" color="muted">
          Given as data
        </Text>
        <Breadcrumbs
          items={[
            { label: "Acme", to: "/" },
            { label: "Navigation", to: "/navigation" },
            { label: "Invoice #1042" },
          ]}
        />
      </Stack>
      <Stack gap={1}>
        <Text size="xs" color="muted">
          A long trail, its middle folded into a menu
        </Text>
        <Breadcrumbs
          expandLabel="Show the folders between"
          items={[
            { label: "Acme", to: "/" },
            { label: "Workspaces", to: "/navigation" },
            { label: "Finance", to: "/navigation", search: { folder: "finance" } },
            { label: "2026", to: "/navigation", search: { folder: "2026" } },
            { label: "Q4", to: "/navigation", search: { folder: "q4" } },
            { label: "November close" },
          ]}
        />
      </Stack>
    </Stack>
  );
}
