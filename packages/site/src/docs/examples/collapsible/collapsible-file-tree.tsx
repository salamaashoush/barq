import { For, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { File } from "@barqjs/lucide/icons/file";
import { Folder } from "@barqjs/lucide/icons/folder";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@barqjs/ui";

type FileTreeItem = { name: string } | { name: string; items: FileTreeItem[] };

const fileTree: FileTreeItem[] = [
  {
    name: "components",
    items: [
      {
        name: "ui",
        items: [
          { name: "button.tsx" },
          { name: "card.tsx" },
          { name: "dialog.tsx" },
          { name: "input.tsx" },
          { name: "select.tsx" },
          { name: "table.tsx" },
        ],
      },
      { name: "login-form.tsx" },
      { name: "register-form.tsx" },
    ],
  },
  {
    name: "lib",
    items: [{ name: "utils.ts" }, { name: "cn.ts" }, { name: "api.ts" }],
  },
  {
    name: "hooks",
    items: [
      { name: "use-media-query.ts" },
      { name: "use-debounce.ts" },
      { name: "use-local-storage.ts" },
    ],
  },
  {
    name: "types",
    items: [{ name: "index.d.ts" }, { name: "api.d.ts" }],
  },
  {
    name: "public",
    items: [{ name: "favicon.ico" }, { name: "logo.svg" }, { name: "images" }],
  },
  { name: "app.tsx" },
  { name: "layout.tsx" },
  { name: "globals.css" },
  { name: "package.json" },
  { name: "tsconfig.json" },
  { name: "README.md" },
  { name: ".gitignore" },
];

const card = css`
  margin-inline: auto;
  width: 100%;
  max-width: 16rem;
  gap: calc(var(--spacing) * 2);
`;

const tabs = css`
  width: 100%;
`;

const column = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
`;

const folder = css`
  width: 100%;
  justify-content: flex-start;
  transition: none;

  &:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }
`;

const chevron = css`
  transition: transform 150ms;

  [data-state="open"] > & {
    transform: rotate(90deg);
  }

  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

const nested = css`
  margin-top: calc(var(--spacing) * 1);
  margin-inline-start: calc(var(--spacing) * 5);
`;

const file = css`
  width: 100%;
  justify-content: flex-start;
  gap: calc(var(--spacing) * 2);
  color: var(--foreground);
`;

function TreeItem(props: Incoming<{ item: FileTreeItem }>) {
  const item = props.item();
  if ("items" in item) {
    return (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" class={folder}>
            <ChevronRight class={chevron} />
            <Folder />
            {item.name}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent class={nested}>
          <div class={column}>
            <For each={item.items}>{(child: FileTreeItem) => <TreeItem item={child} />}</For>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <Button variant="link" size="sm" class={file}>
      <File />
      <span>{item.name}</span>
    </Button>
  );
}

export default function CollapsibleFileTree() {
  return (
    <Card class={card} size="sm">
      <CardHeader>
        <Tabs defaultValue="explorer">
          <TabsList class={tabs}>
            <TabsTrigger value="explorer">Explorer</TabsTrigger>
            <TabsTrigger value="settings">Outline</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div class={column}>
          <For each={fileTree}>{(item: FileTreeItem) => <TreeItem item={item} />}</For>
        </div>
      </CardContent>
    </Card>
  );
}
