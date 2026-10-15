/**
 * shadcn's `sidebar-11`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-11/`.
 */

import { For, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@barqjs/ui";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { File } from "@barqjs/lucide/icons/file";
import { Folder } from "@barqjs/lucide/icons/folder";
import { blockFillsPreview } from "../layout.ts";

const header = css`
  display: flex;
  height: 4rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-inline: 1rem;
`;

const trigger = css`
  margin-left: -0.25rem;
`;

const rule = css`
  margin-right: 0.5rem;

  &[data-orientation="vertical"] {
    height: 1rem;
  }
`;

const wideOnly = css`
  display: none;

  @container preview (width >= 48rem) {
    display: block;
  }
`;

const body = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`;

const tiles = css`
  display: grid;
  grid-auto-rows: min-content;
  gap: 1rem;

  @container preview (width >= 48rem) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const tile = css`
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const panel = css`
  min-height: 100vh;
  flex: 1;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);

  @container preview (width >= 48rem) {
    min-height: min-content;
  }
`;

const leaf = css`
  &[data-active="true"] {
    background: transparent;
  }
`;

const chevron = css`
  transition-property: rotate;
  transition-duration: 150ms;

  [data-state="open"] > & {
    rotate: 90deg;
  }
`;

const CHANGES = [
  { file: "README.md", state: "M" },
  { file: "api/hello/route.ts", state: "U" },
  { file: "app/layout.tsx", state: "M" },
];

/** A file is its name; a directory is its name followed by what it holds. */
type TreeItem = string | readonly TreeItem[];

const TREE: readonly TreeItem[] = [
  ["app", ["api", ["hello", ["route.ts"]], "page.tsx", "layout.tsx", ["blog", ["page.tsx"]]]],
  ["components", ["ui", "button.tsx", "card.tsx"], "header.tsx", "footer.tsx"],
  ["lib", ["util.ts"]],
  ["public", "favicon.ico", "vercel.svg"],
  ".eslintrc.json",
  ".gitignore",
  "next.config.js",
  "tailwind.config.js",
  "package.json",
  "README.md",
];

const OPEN = new Set(["components", "ui"]);

function Tree(props: Incoming<{ item: TreeItem }>) {
  const item = props.item();
  const [first, ...items] = typeof item === "string" ? [item] : item;
  const name = typeof first === "string" ? first : "";

  return (
    <>
      {items.length === 0 ? (
        <SidebarMenuButton isActive={name === "button.tsx"} class={leaf}>
          <File />
          {name}
        </SidebarMenuButton>
      ) : (
        <SidebarMenuItem>
          <Collapsible defaultOpen={OPEN.has(name)}>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton>
                <ChevronRight class={chevron} />
                <Folder />
                {name}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                <For each={() => items}>{(sub: TreeItem) => <Tree item={sub} />}</For>
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        </SidebarMenuItem>
      )}
    </>
  );
}

export function Sidebar11() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Changes</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <For each={() => CHANGES}>
                  {(change: (typeof CHANGES)[number]) => (
                    <SidebarMenuItem>
                      <SidebarMenuButton>
                        <File />
                        {change.file}
                      </SidebarMenuButton>
                      <SidebarMenuBadge>{change.state}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  )}
                </For>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Files</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <For each={() => TREE}>{(item: TreeItem) => <Tree item={item} />}</For>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header class={header}>
          <SidebarTrigger class={trigger} />
          <Separator orientation="vertical" class={rule} />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem class={wideOnly}>
                <BreadcrumbLink href="#">components</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator class={wideOnly} />
              <BreadcrumbItem class={wideOnly}>
                <BreadcrumbLink href="#">ui</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator class={wideOnly} />
              <BreadcrumbItem>
                <BreadcrumbPage>button.tsx</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div class={body}>
          <div class={tiles}>
            <div class={tile} />
            <div class={tile} />
            <div class={tile} />
          </div>
          <div class={panel} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
