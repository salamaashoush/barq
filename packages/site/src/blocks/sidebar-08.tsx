/**
 * shadcn's `sidebar-08`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-08/`.
 */

import { For, type Incoming } from "@barqjs/core";
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
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  srOnly,
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
import { Send } from "@barqjs/lucide/icons/send";
import { Settings2 } from "@barqjs/lucide/icons/settings-2";
import { Share } from "@barqjs/lucide/icons/share";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { SquareTerminal } from "@barqjs/lucide/icons/square-terminal";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { blockFillsPreview } from "../layout.ts";

const header = css`
  display: flex;
  height: 4rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
`;

const headerInner = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  padding-top: 0;
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

const teamMark = css`
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
  display: grid;
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 0.875rem;
  line-height: 1.25;

  & span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  & span:first-child {
    font-weight: 500;
  }

  & span:last-child {
    font-size: 0.75rem;
  }
`;

const chevron = css`
  &[data-state="open"] {
    rotate: 90deg;
  }
`;

const hiddenAsIcons = css`
  [data-collapsible="icon"] & {
    display: none;
  }
`;

const pushedDown = css`
  margin-top: auto;
`;

const quiet = css`
  color: var(--muted-foreground);
`;

const projectMenu = css`
  width: 12rem;
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

const userMenu = css`
  min-width: 14rem;
  border-radius: var(--radius);
`;

const userAvatar = css`
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius);
`;

const trailing = css`
  margin-left: auto;
  width: 1rem;
  height: 1rem;
`;

const USER = { name: "salama", email: "m@example.com", initials: "SA" };

interface NavItem {
  readonly id: string;
  readonly name: string;
  readonly icon: typeof SquareTerminal;
  readonly open?: boolean;
  readonly items: readonly { readonly id: string; readonly name: string }[];
}

const NAV_MAIN: readonly NavItem[] = [
  {
    id: "playground",
    name: "Playground",
    icon: SquareTerminal,
    open: true,
    items: [
      { id: "history", name: "History" },
      { id: "starred", name: "Starred" },
      { id: "settings", name: "Settings" },
    ],
  },
  {
    id: "models",
    name: "Models",
    icon: Bot,
    items: [
      { id: "genesis", name: "Genesis" },
      { id: "explorer", name: "Explorer" },
      { id: "quantum", name: "Quantum" },
    ],
  },
  {
    id: "documentation",
    name: "Documentation",
    icon: BookOpen,
    items: [
      { id: "introduction", name: "Introduction" },
      { id: "get-started", name: "Get Started" },
      { id: "tutorials", name: "Tutorials" },
      { id: "changelog", name: "Changelog" },
    ],
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings2,
    items: [
      { id: "general", name: "General" },
      { id: "team", name: "Team" },
      { id: "billing", name: "Billing" },
      { id: "limits", name: "Limits" },
    ],
  },
];

const NAV_SECONDARY = [
  { id: "support", name: "Support", icon: LifeBuoy },
  { id: "feedback", name: "Feedback", icon: Send },
];

const PROJECTS = [
  { id: "design", name: "Design Engineering", icon: Frame },
  { id: "sales", name: "Sales & Marketing", icon: ChartPie },
  { id: "travel", name: "Travel", icon: MapIcon },
];

// A component per row: the open state has to belong to the row, and a signal
// held by the loop would be shared by all four.
function NavRow(props: Incoming<{ item: NavItem }>) {
  const item = props.item();

  return (
    <Collapsible
      defaultOpen={item.open === true}
      render={(root) => (
        <SidebarMenuItem {...root.props} ref={root.ref}>
          <SidebarMenuButton href="#" tooltip={item.name}>
            <item.icon />
            <span>{item.name}</span>
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
                        <SidebarMenuSubButton href="#">
                          <span>{sub.name}</span>
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
  );
}

function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        <For each={() => NAV_MAIN}>{(item: NavItem) => <NavRow item={item} />}</For>
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavProjects() {
  return (
    <SidebarGroup class={hiddenAsIcons}>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        <For each={() => PROJECTS}>
          {(project: (typeof PROJECTS)[number]) => (
            <SidebarMenuItem>
              <SidebarMenuButton href="#">
                <project.icon />
                <span>{project.name}</span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuAction showOnHover aria-label="More">
                    <Ellipsis />
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  aria-label="Project actions"
                  class={projectMenu}
                  placement="right top"
                >
                  <DropdownMenuItem>
                    <Folder class={quiet} />
                    <span>View Project</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share class={quiet} />
                    <span>Share Project</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Trash2 class={quiet} />
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
                <SidebarMenuButton href="#" size="sm">
                  <item.icon />
                  <span>{item.name}</span>
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
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton size="lg">
              <Avatar class={userAvatar}>
                <AvatarFallback class={userAvatar}>{USER.initials}</AvatarFallback>
              </Avatar>
              <div class={stack}>
                <span>{USER.name}</span>
                <span>{USER.email}</span>
              </div>
              <ChevronsUpDown class={trailing} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            aria-label="Account"
            class={userMenu}
            placement="right bottom"
            offset={4}
          >
            <DropdownMenuLabel class={userLabel}>
              <div class={userCard}>
                <Avatar class={userAvatar}>
                  <AvatarFallback class={userAvatar}>{USER.initials}</AvatarFallback>
                </Avatar>
                <div class={stack}>
                  <span>{USER.name}</span>
                  <span>{USER.email}</span>
                </div>
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

export function Sidebar08() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" href="#">
                <div class={teamMark}>
                  <Command />
                </div>
                <div class={stack}>
                  <span>Acme Inc</span>
                  <span>Enterprise</span>
                </div>
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

      <SidebarInset>
        <header class={header}>
          <div class={headerInner}>
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
          </div>
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
