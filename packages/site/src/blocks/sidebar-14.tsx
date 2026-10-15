/**
 * shadcn's `sidebar-14`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-14/`.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@barqjs/ui";

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

const wide = css`
  display: none;

  @container preview (width >= 48rem) {
    display: block;
  }
`;

const trigger = css`
  margin-right: -0.25rem;
  margin-left: auto;
  rotate: 180deg;
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
  min-height: 24rem;
  flex: 1;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const medium = css`
  font-weight: 500;
`;

interface NavLink {
  readonly title: string;
  readonly url: string;
  readonly isActive?: boolean;
}

interface NavSection {
  readonly title: string;
  readonly url: string;
  readonly items: readonly NavLink[];
}

const NAV_MAIN: readonly NavSection[] = [
  {
    title: "Getting Started",
    url: "#",
    items: [
      { title: "Installation", url: "#" },
      { title: "Project Structure", url: "#" },
    ],
  },
  {
    title: "Build Your Application",
    url: "#",
    items: [
      { title: "Routing", url: "#" },
      { title: "Data Fetching", url: "#", isActive: true },
      { title: "Rendering", url: "#" },
      { title: "Caching", url: "#" },
      { title: "Styling", url: "#" },
      { title: "Optimizing", url: "#" },
      { title: "Configuring", url: "#" },
      { title: "Testing", url: "#" },
      { title: "Authentication", url: "#" },
      { title: "Deploying", url: "#" },
      { title: "Upgrading", url: "#" },
      { title: "Examples", url: "#" },
    ],
  },
  {
    title: "API Reference",
    url: "#",
    items: [
      { title: "Components", url: "#" },
      { title: "File Conventions", url: "#" },
      { title: "Functions", url: "#" },
      { title: "next.config.js Options", url: "#" },
      { title: "CLI", url: "#" },
      { title: "Edge Runtime", url: "#" },
    ],
  },
  {
    title: "Architecture",
    url: "#",
    items: [
      { title: "Accessibility", url: "#" },
      { title: "Fast Refresh", url: "#" },
      { title: "Next.js Compiler", url: "#" },
      { title: "Supported Browsers", url: "#" },
      { title: "Turbopack", url: "#" },
    ],
  },
  {
    title: "Community",
    url: "#",
    items: [{ title: "Contribution Guide", url: "#" }],
  },
];

function AppSidebar() {
  return (
    <Sidebar side="right">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Table of Contents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={() => NAV_MAIN}>
                {(section: NavSection) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton href={section.url} class={medium}>
                      {section.title}
                    </SidebarMenuButton>
                    {section.items.length === 0 ? null : (
                      <SidebarMenuSub>
                        <For each={() => section.items}>
                          {(link: NavLink) => (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                href={link.url}
                                isActive={link.isActive === true}
                              >
                                {link.title}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )}
                        </For>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function Sidebar14() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <SidebarInset>
        <header class={header}>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem class={wide}>
                <BreadcrumbLink href="#">Build Your Application</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator class={wide} />
              <BreadcrumbItem>
                <BreadcrumbPage>Data Fetching</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <SidebarTrigger class={trigger} />
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
      <AppSidebar />
    </SidebarProvider>
  );
}
