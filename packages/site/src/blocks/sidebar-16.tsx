/**
 * shadcn's `sidebar-16`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-16/`.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Avatar,
  AvatarFallback,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  cn,
  srOnly,
  useSidebar,
} from "@barqjs/ui";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bell } from "@barqjs/lucide/icons/bell";
import { BookOpen } from "@barqjs/lucide/icons/book-open";
import { Bot } from "@barqjs/lucide/icons/bot";
import { ChartPie } from "@barqjs/lucide/icons/chart-pie";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { Command } from "@barqjs/lucide/icons/command";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Folder } from "@barqjs/lucide/icons/folder";
import { Frame } from "@barqjs/lucide/icons/frame";
import { LifeBuoy } from "@barqjs/lucide/icons/life-buoy";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { PanelLeft } from "@barqjs/lucide/icons/panel-left";
import { Search } from "@barqjs/lucide/icons/search";
import { Send } from "@barqjs/lucide/icons/send";
import { Settings2 } from "@barqjs/lucide/icons/settings-2";
import { Share } from "@barqjs/lucide/icons/share";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { SquareTerminal } from "@barqjs/lucide/icons/square-terminal";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

import { blockFillsPreview } from "../layout.ts";

const root = css`
  --header-height: 3.5rem;
`;

const column = css`
  flex-direction: column;
`;

const siteHeader = css`
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  width: 100%;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--background);
`;

const siteHeaderInner = css`
  display: flex;
  height: var(--header-height);
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 1rem;
`;

const toggle = css`
  width: 2rem;
  height: 2rem;
`;

/** `align-self` with it: the separator stretches by default, and a set height alone pins it to the top. */
const rule = css`
  margin-right: 0.5rem;
  height: 1rem;
  align-self: center;
`;

const crumbs = css`
  display: none;

  @container preview (width >= 40rem) {
    display: block;
  }
`;

const searchForm = css`
  width: 100%;

  @container preview (width >= 40rem) {
    margin-left: auto;
    width: auto;
  }
`;

const searchBox = css`
  position: relative;
`;

const searchInput = css`
  height: 2rem;
  padding-left: 1.75rem;
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

const row = css`
  display: flex;
  flex: 1;
`;

/**
 * `top-(--header-height)` with `h-[calc(100svh-var(--header-height))]!`
 * upstream. The container is already pinned to both block edges, so moving its
 * top edge under the header is the whole of it and no height is restated.
 */
const underHeader = css`
  top: var(--header-height);
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

const brandMark = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: 2rem;
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

const identity = css`
  display: grid;
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 0.875rem;
  line-height: 1.25;

  & strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  & span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
  }
`;

const chevron = css`
  &[data-state="open"] {
    rotate: 90deg;
  }
`;

const hiddenAsIcons = css`
  [data-slot="sidebar"][data-collapsible="icon"] & {
    display: none;
  }
`;

const projectMenu = css`
  width: 12rem;
`;

const mutedIcon = css`
  color: var(--muted-foreground);
`;

const pushedDown = css`
  margin-top: auto;
`;

const openLook = css`
  &[aria-expanded="true"] {
    background: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
`;

const avatar = css`
  width: 2rem;
  height: 2rem;
  flex: none;
  border-radius: var(--radius);

  & [data-slot="avatar-fallback"] {
    border-radius: var(--radius);
  }
`;

const trailing = css`
  margin-left: auto;
  width: 1rem;
  height: 1rem;
`;

const userMenu = css`
  min-width: 14rem;
  border-radius: var(--radius);
`;

const userLabel = css`
  padding: 0;
  font-weight: 400;
`;

const userCard = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.25rem;
  text-align: left;
  font-size: 0.875rem;
`;

const USER = { name: "salama", email: "m@example.com", initials: "SA" };

interface NavItem {
  readonly title: string;
  readonly url: string;
  readonly icon: typeof SquareTerminal;
  readonly isActive?: boolean;
  readonly items: readonly { readonly title: string; readonly url: string }[];
}

const NAV_MAIN: readonly NavItem[] = [
  {
    title: "Playground",
    url: "#",
    icon: SquareTerminal,
    isActive: true,
    items: [
      { title: "History", url: "#" },
      { title: "Starred", url: "#" },
      { title: "Settings", url: "#" },
    ],
  },
  {
    title: "Models",
    url: "#",
    icon: Bot,
    items: [
      { title: "Genesis", url: "#" },
      { title: "Explorer", url: "#" },
      { title: "Quantum", url: "#" },
    ],
  },
  {
    title: "Documentation",
    url: "#",
    icon: BookOpen,
    items: [
      { title: "Introduction", url: "#" },
      { title: "Get Started", url: "#" },
      { title: "Tutorials", url: "#" },
      { title: "Changelog", url: "#" },
    ],
  },
  {
    title: "Settings",
    url: "#",
    icon: Settings2,
    items: [
      { title: "General", url: "#" },
      { title: "Team", url: "#" },
      { title: "Billing", url: "#" },
      { title: "Limits", url: "#" },
    ],
  },
];

const NAV_SECONDARY = [
  { title: "Support", url: "#", icon: LifeBuoy },
  { title: "Feedback", url: "#", icon: Send },
];

const PROJECTS = [
  { name: "Design Engineering", url: "#", icon: Frame },
  { name: "Sales & Marketing", url: "#", icon: ChartPie },
  { name: "Travel", url: "#", icon: MapIcon },
];

function SearchForm() {
  return (
    <form class={searchForm}>
      <div class={searchBox}>
        <Label for="search" class={srOnly}>
          Search
        </Label>
        <SidebarInput id="search" placeholder="Type to search..." class={searchInput} />
        <Search class={searchIcon} />
      </div>
    </form>
  );
}

function SiteHeader() {
  const sidebar = useSidebar();

  return (
    <header class={siteHeader}>
      <div class={siteHeaderInner}>
        <Button
          class={toggle}
          variant="ghost"
          size="icon"
          aria-label="Toggle Sidebar"
          onPress={() => sidebar.toggle()}
        >
          <PanelLeft />
        </Button>
        <Separator orientation="vertical" class={rule} />
        <Breadcrumb class={crumbs}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Build Your Application</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Data Fetching</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <SearchForm />
      </div>
    </header>
  );
}

function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        <For each={() => NAV_MAIN}>
          {(item: NavItem) => (
            <Collapsible
              defaultOpen={item.isActive === true}
              render={(part) => (
                <SidebarMenuItem {...part.props} ref={part.ref}>
                  <SidebarMenuButton href={item.url} tooltip={item.title}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.items.length === 0 ? null : (
                    <>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuAction class={chevron}>
                          <ChevronRight />
                          <span class={srOnly}>Toggle</span>
                        </SidebarMenuAction>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <For each={() => item.items}>
                            {(sub: NavItem["items"][number]) => (
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton href={sub.url}>
                                  <span>{sub.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )}
                          </For>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </>
                  )}
                </SidebarMenuItem>
              )}
            />
          )}
        </For>
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavProjects() {
  const sidebar = useSidebar();

  return (
    <SidebarGroup class={hiddenAsIcons}>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        <For each={() => PROJECTS}>
          {(project: (typeof PROJECTS)[number]) => (
            <SidebarMenuItem>
              <SidebarMenuButton href={project.url}>
                <project.icon />
                <span>{project.name}</span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuAction showOnHover>
                    <Ellipsis />
                    <span class={srOnly}>More</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  aria-label="Project actions"
                  class={projectMenu}
                  placement={() => (sidebar.isMobile() ? "bottom end" : "right top")}
                >
                  <DropdownMenuItem>
                    <Folder class={mutedIcon} />
                    <span>View Project</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share class={mutedIcon} />
                    <span>Share Project</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Trash2 class={mutedIcon} />
                    <span>Delete Project</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </For>
        <SidebarMenuItem>
          <SidebarMenuButton>
            <Ellipsis />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavSecondary() {
  return (
    <SidebarGroup class={pushedDown}>
      <SidebarGroupContent>
        <SidebarMenu>
          <For each={() => NAV_SECONDARY}>
            {(item: (typeof NAV_SECONDARY)[number]) => (
              <SidebarMenuItem>
                <SidebarMenuButton href={item.url} size="sm">
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </For>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavUser() {
  const sidebar = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton size="lg" class={openLook}>
              <Avatar class={avatar}>
                <AvatarFallback>{USER.initials}</AvatarFallback>
              </Avatar>
              <span class={identity}>
                <strong>{USER.name}</strong>
                <span>{USER.email}</span>
              </span>
              <ChevronsUpDown class={trailing} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            aria-label="Account"
            class={userMenu}
            placement={() => (sidebar.isMobile() ? "bottom" : "right bottom")}
            offset={4}
          >
            <DropdownMenuLabel class={userLabel}>
              <div class={userCard}>
                <Avatar class={avatar}>
                  <AvatarFallback>{USER.initials}</AvatarFallback>
                </Avatar>
                <span class={identity}>
                  <strong>{USER.name}</strong>
                  <span>{USER.email}</span>
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar() {
  return (
    <Sidebar class={underHeader}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" href="#">
              <div class={brandMark}>
                <Command />
              </div>
              <span class={identity}>
                <strong>Acme Inc</strong>
                <span>Enterprise</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavProjects />
        <NavSecondary />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

export function Sidebar16() {
  return (
    <div class={cn(blockFillsPreview, root)} data-slot="sidebar-16">
      <SidebarProvider class={cn(blockFillsPreview, column)}>
        <SiteHeader />
        <div class={row}>
          <AppSidebar />
          <SidebarInset>
            <div class={body}>
              <div class={tiles}>
                <div class={tile} />
                <div class={tile} />
                <div class={tile} />
              </div>
              <div class={panel} />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
