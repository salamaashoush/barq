/**
 * shadcn's `sidebar-01`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-01/`.
 */

import { For, createSignal, type Incoming, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  srOnly,
} from "@barqjs/ui";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { GalleryVerticalEnd } from "@barqjs/lucide/icons/gallery-vertical-end";
import { Search } from "@barqjs/lucide/icons/search";
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
  height: 1rem;
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

const openLook = css`
  &[aria-expanded="true"] {
    background: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
`;

const mark = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);

  & svg {
    width: 1rem;
    height: 1rem;
  }
`;

const stack = css`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  line-height: 1;
`;

const medium = css`
  font-weight: 500;
`;

const trailing = css`
  margin-left: auto;
`;

const flushGroup = css`
  padding-block: 0;
`;

const searchBox = css`
  position: relative;
`;

const searchInput = css`
  padding-left: 2rem;
`;

const searchIcon = css`
  pointer-events: none;
  position: absolute;
  top: 50%;
  left: 0.5rem;
  width: 1rem;
  height: 1rem;
  translate: 0 -50%;
  opacity: 0.5;
  user-select: none;
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

const VERSIONS: readonly string[] = ["1.0.1", "1.1.0-alpha", "2.0.0-beta1"];

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
];

function VersionSwitcher(props: Incoming<{ versions: readonly string[]; defaultVersion: string }>) {
  const [selected, setSelected] = createSignal(props.defaultVersion());

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton size="lg" class={openLook}>
              <div class={mark}>
                <GalleryVerticalEnd />
              </div>
              <div class={stack}>
                <span class={medium}>Documentation</span>
                <span>v{selected()}</span>
              </div>
              <ChevronsUpDown class={trailing} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <For each={() => props.versions()}>
              {(version: string) => (
                <DropdownMenuItem onSelect={() => setSelected(version)}>
                  v{version}{" "}
                  <Show when={version === selected()}>
                    <Check class={trailing} />
                  </Show>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function SearchForm() {
  return (
    <form>
      <SidebarGroup class={flushGroup}>
        <SidebarGroupContent class={searchBox}>
          <Label for="search" class={srOnly}>
            Search
          </Label>
          <SidebarInput id="search" placeholder="Search the docs..." class={searchInput} />
          <Search class={searchIcon} />
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  );
}

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <VersionSwitcher versions={VERSIONS} defaultVersion={VERSIONS[0] ?? ""} />
        <SearchForm />
      </SidebarHeader>
      <SidebarContent>
        <For each={() => NAV_MAIN}>
          {(section: NavSection) => (
            <SidebarGroup>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <For each={() => section.items}>
                    {(item: NavLink) => (
                      <SidebarMenuItem>
                        <SidebarMenuButton href={item.url} isActive={item.isActive === true}>
                          {item.title}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </For>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </For>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function Sidebar01() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <AppSidebar />
      <SidebarInset>
        <header class={header}>
          <SidebarTrigger class={trigger} />
          <Separator orientation="vertical" class={rule} />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem class={wideOnly}>
                <BreadcrumbLink href="#">Build Your Application</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator class={wideOnly} />
              <BreadcrumbItem>
                <BreadcrumbPage>Data Fetching</BreadcrumbPage>
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
