import { For } from "@barqjs/core";
import { Grid, Heading, Inline, PageHeader, Stack, Tile } from "@barqjs/arc";
import { createFileRoute, useNavigate } from "@barqjs/router";

import { type Group, SECTIONS, type Section, pathOf } from "../gallery/groups.ts";

function Overview() {
  const navigate = useNavigate();
  return (
    <Stack gap={8}>
      <PageHeader
        heading="arc"
        description="barq's product design system, every component working. Change the theme, density, direction and contrast from the top bar, or press ⌘K (Ctrl+K elsewhere) to find a component."
      />
      <For each={SECTIONS}>
        {(section: Section) => (
          <Stack gap={3}>
            <Heading level={2} size="md">
              {section.label}
            </Heading>
            <Grid columns={{ base: 1, cqMd: 2, cqLg: 3 }} gap={4}>
              <For each={section.groups}>
                {(group: Group) => {
                  const Icon = group.icon;
                  return (
                    <Tile
                      onPress={() => void navigate({ to: pathOf(group.catalog) })}
                      eyebrow={
                        <Inline gap={2} align="center">
                          <Icon />
                          {group.catalog.examples.length} examples
                        </Inline>
                      }
                      title={group.catalog.title}
                      description={group.catalog.description}
                    />
                  );
                }}
              </For>
            </Grid>
          </Stack>
        )}
      </For>
    </Stack>
  );
}

export const Route = createFileRoute("/")({
  component: Overview,
  staticData: { crumb: "Overview" },
});
