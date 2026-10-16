/**
 * shadcn's `sidebar-07`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-07/`.
 *
 * The collapsible nav: a team switcher in a dropdown, four groups that open to
 * reveal sub-items, a projects list with a row menu, a user menu in the footer,
 * and a breadcrumb header over three placeholders. It is the block that asks
 * about the sidebar's DEPTH — submenus, a rotating chevron, a menu action that
 * only appears on hover — where `dashboard-01` asks about its width.
 */

import { For, createSignal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bell } from "@barqjs/lucide/icons/bell";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Folder } from "@barqjs/lucide/icons/folder";
import { Forward } from "@barqjs/lucide/icons/forward";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { Trash } from "@barqjs/lucide/icons/trash";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
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
  SidebarRail,
  SidebarTrigger,
} from "@barqjs/ui";
import { BookOpen } from "@barqjs/lucide/icons/book-open";
import { Bot } from "@barqjs/lucide/icons/bot";
import { blockFillsPreview } from "../layout.ts";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { Frame } from "@barqjs/lucide/icons/frame";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { ChartPie } from "@barqjs/lucide/icons/chart-pie";
import { Settings2 } from "@barqjs/lucide/icons/settings-2";
import { SquareTerminal } from "@barqjs/lucide/icons/square-terminal";

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

/** `aspect-video rounded-xl bg-muted/50`, upstream's placeholder. */
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

/** `ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90`. */
const chevron = css`
  margin-left: auto;
  transition-property: rotate;
  transition-duration: 200ms;

  [data-state="open"] > & {
    rotate: 90deg;
  }
`;

const teamMark = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);
`;

const stack = css`
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
    font-weight: 600;
  }

  & span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
`;

const trailing = css`
  margin-left: auto;
  width: 1rem;
  height: 1rem;
`;

const quiet = css`
  color: var(--muted-foreground);
`;

const teamsLabel = css`
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

const teamMenu = css`
  min-width: 14rem;
  border-radius: var(--radius-lg);
`;

const projectMenu = css`
  width: 12rem;
  border-radius: var(--radius-lg);
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

const TEAMS = [
  { id: "acme", name: "Acme Inc", plan: "Enterprise", shortcut: "\u23181" },
  { id: "corp", name: "Acme Corp.", plan: "Startup", shortcut: "\u23182" },
  { id: "evil", name: "Evil Corp.", plan: "Free", shortcut: "\u23183" },
];

interface NavItem {
  readonly id: string;
  readonly name: string;
  readonly icon: typeof SquareTerminal;
  readonly open?: boolean;
  readonly items: readonly { readonly id: string; readonly name: string }[];
}

const NAV: readonly NavItem[] = [
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

const PROJECTS = [
  { id: "design", name: "Design Engineering", icon: Frame },
  { id: "sales", name: "Sales & Marketing", icon: ChartPie },
  { id: "travel", name: "Travel", icon: MapIcon },
];

function NavRow(props: Incoming<{ item: NavItem }>) {
  const item = props.item();
  const Icon = item.icon;

  return (
    <Collapsible
      defaultOpen={item.open === true}
      render={(root) => (
        <SidebarMenuItem {...root.props} ref={root.ref}>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={item.name}>
              <Icon />
              <span>{item.name}</span>
              <ChevronRight class={chevron} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              <For each={() => item.items}>
                {(sub: { id: string; name: string }) => (
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton href="#">
                      <span>{sub.name}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                )}
              </For>
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      )}
    />
  );
}

export function Sidebar07() {
  const [team, setTeam] = createSignal(TEAMS[0]!);

  return (
    <SidebarProvider class={blockFillsPreview}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuButton size="lg">
                    <div class={teamMark}>
                      <Frame />
                    </div>
                    <span class={stack}>
                      <strong>{team().name}</strong>
                      <span>{team().plan}</span>
                    </span>
                    <ChevronsUpDown class={trailing} />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label="Teams" align="start" class={teamMenu}>
                  <DropdownMenuLabel class={teamsLabel}>Teams</DropdownMenuLabel>
                  <For each={() => TEAMS}>
                    {(entry: (typeof TEAMS)[number]) => (
                      <DropdownMenuItem onSelect={() => setTeam(entry)}>
                        {entry.name}
                        <DropdownMenuShortcut>{entry.shortcut}</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    )}
                  </For>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Plus />
                    <span class={quiet}>Add team</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
              <For each={() => NAV}>{(item: NavItem) => <NavRow item={item} />}</For>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
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
                        <SidebarMenuAction aria-label={`Actions for ${project.name}`}>
                          <Ellipsis />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent aria-label="Project actions" class={projectMenu}>
                        <DropdownMenuItem>
                          <Folder class={quiet} />
                          <span>View Project</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Forward class={quiet} />
                          <span>Share Project</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive">
                          <Trash />
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
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuButton size="lg">
                    <div class={teamMark}>SA</div>
                    <span class={stack}>
                      <strong>sashoush</strong>
                      <span>me@example.com</span>
                    </span>
                    <ChevronsUpDown class={trailing} />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label="Account" class={teamMenu}>
                  <DropdownMenuLabel class={userLabel}>
                    <div class={userCard}>
                      <div class={teamMark}>SA</div>
                      <span class={stack}>
                        <strong>sashoush</strong>
                        <span>me@example.com</span>
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
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header class={header}>
          <div class={headerInner}>
            <SidebarTrigger />
            <Separator orientation="vertical" />
            <Breadcrumb>
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
