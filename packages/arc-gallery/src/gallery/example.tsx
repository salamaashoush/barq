import { For, Show, createSignal, untrack } from "@barqjs/core";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Heading,
  InlineAlert,
  PageHeader,
  Stack,
  Text,
} from "@barqjs/arc";
import { CodeBlock } from "@barqjs/arc/code";
import { bg, edge, gap, layout, space, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { CodeXml } from "@barqjs/lucide/icons/code-xml";

import type { Demo, Demos, ExampleInfo, GroupCatalog } from "./types.ts";

const gallery = layer("gallery");

const card = gallery(surface.card, layout.column, {
  scrollMarginTop: space.x16,
  overflow: "clip",
});

const head = gallery(layout.row, layout.between, gap[3], {
  paddingInline: space.x5,
  paddingBlock: space.x4,
});

const preview = gallery(layout.container, edge.top, {
  padding: space.x6,
  minWidth: "0px",
});

const code = gallery(edge.top, bg.sunken, { padding: space.x3 });

const covers = gallery(layout.row, layout.wrap, gap[1]);

interface ExampleCardProps {
  info: ExampleInfo;
  demo: Demo | undefined;
}

function ExampleCard(props: ExampleCardProps) {
  const [open, setOpen] = createSignal(false);
  const info = untrack(() => props.info);
  const demo = untrack(() => props.demo);
  const Component = demo?.component;
  return (
    <section
      id={info.id}
      class={card}
      data-slot="gallery-example"
      aria-labelledby={`${info.id}-title`}
    >
      <Collapsible open={open()} onOpenChange={setOpen}>
        <div class={head}>
          <Stack gap={1}>
            <Heading level={3} size="sm" id={`${info.id}-title`}>
              {info.title}
            </Heading>
            <Show when={info.description !== undefined}>
              <Text size="sm" color="muted">
                {info.description}
              </Text>
            </Show>
            <div class={covers}>
              <For each={info.covers}>
                {(name: string) => (
                  <Text as="span" size="xs" mono color="muted">
                    {name}
                  </Text>
                )}
              </For>
            </div>
          </Stack>
          <Show when={demo !== undefined}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Code for ${info.title}`}>
                <CodeXml />
                Code
                <ChevronDown />
              </Button>
            </CollapsibleTrigger>
          </Show>
        </div>
        <div class={preview} data-slot="gallery-preview">
          {Component === undefined ? (
            <InlineAlert tone="danger" title="Missing example">
              No demo is registered under "{info.id}".
            </InlineAlert>
          ) : (
            <Component />
          )}
        </div>
        <Show when={demo !== undefined}>
          <CollapsibleContent>
            <div class={code}>
              <CodeBlock
                language="tsx"
                code={demo?.code ?? ""}
                label={`${info.id}.tsx`}
                maxHeight={480}
              />
            </div>
          </CollapsibleContent>
        </Show>
      </Collapsible>
    </section>
  );
}

export interface GroupPageProps {
  catalog: GroupCatalog;
  demos: Demos;
}

/** A group's page: its heading, then every example in the catalog's order. */
export function GroupPage(props: GroupPageProps) {
  return (
    <Stack gap={8}>
      <PageHeader heading={props.catalog.title} description={props.catalog.description} />
      <For each={props.catalog.examples}>
        {(info: ExampleInfo) => <ExampleCard info={info} demo={props.demos[info.id]} />}
      </For>
    </Stack>
  );
}
