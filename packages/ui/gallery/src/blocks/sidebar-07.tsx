/**
 * shadcn's `sidebar-07`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-07/`.
 *
 * The collapsible nav: a team switcher in a dropdown, four groups that open to
 * reveal sub-items, a projects list with a row menu, a user menu in the footer,
 * and a breadcrumb header over three placeholders. It is the block that asks
 * about the sidebar's DEPTH — submenus, a rotating chevron, a menu action that
 * only appears on hover — where `dashboard-01` asks about its width.
 *
 * THE TRIGGER IS NOT `asChild`, and that is this package rather than a
 * shortcut. Upstream writes `<Collapsible asChild><SidebarMenuItem>` and
 * `<CollapsibleTrigger asChild><SidebarMenuButton>`, cloning each child to
 * attach the disclosure's props; there is no element to clone here, so the
 * open state is a signal the button toggles and the panel reads. Same markup,
 * same behaviour, one less indirection — and `<SidebarMenuButton>` stays the
 * real component rather than a class list copied onto a disclosure button.
 */

import { For, signal, type Incoming } from "@barqjs/core";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

  &[data-open="true"] {
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

const TEAMS = [
  { id: "acme", name: "Acme Inc", plan: "Enterprise" },
  { id: "corp", name: "Acme Corp.", plan: "Startup" },
  { id: "evil", name: "Evil Corp.", plan: "Free" },
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

const PROJECT_ACTIONS = [
  { id: "view", name: "View Project" },
  { id: "share", name: "Share Project" },
  { id: "delete", name: "Delete Project" },
];

const USER_ACTIONS = [
  { id: "upgrade", name: "Upgrade to Pro" },
  { id: "account", name: "Account" },
  { id: "billing", name: "Billing" },
  { id: "notifications", name: "Notifications" },
  { id: "logout", name: "Log out" },
];

/**
 * One collapsible row, with its own open state.
 *
 * A component rather than a closure in the loop, because the signal has to
 * belong to the row: one held outside would be shared by all four and opening
 * Models would open Settings with it.
 */
function NavRow(props: Incoming<{ item: NavItem }>) {
  const item = props.item();
  const open = signal(item.open === true);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => open.set(!open())} aria-expanded={open()}>
        <Icon />
        <span>{item.name}</span>
        <ChevronRight class={chevron} data-open={open() ? "true" : "false"} />
      </SidebarMenuButton>
      <Collapsible isExpanded={open()}>
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
      </Collapsible>
    </SidebarMenuItem>
  );
}

export function Sidebar07() {
  const team = signal(TEAMS[0]!);

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
                <DropdownMenuContent
                  items={TEAMS}
                  aria-label="Teams"
                  onAction={(key: string | number) => {
                    const found = TEAMS.find((each) => each.id === String(key));
                    if (found !== undefined) team.set(found);
                  }}
                >
                  {(entry: (typeof TEAMS)[number]) => (
                    <DropdownMenuItem>{entry.name}</DropdownMenuItem>
                  )}
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
                      <DropdownMenuContent items={PROJECT_ACTIONS} aria-label="Project actions">
                        {(action: (typeof PROJECT_ACTIONS)[number]) => (
                          <DropdownMenuItem
                            variant={action.id === "delete" ? "destructive" : "default"}
                          >
                            {action.name}
                          </DropdownMenuItem>
                        )}
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
                <DropdownMenuContent items={USER_ACTIONS} aria-label="Account">
                  {(action: (typeof USER_ACTIONS)[number]) => (
                    <DropdownMenuItem>{action.name}</DropdownMenuItem>
                  )}
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
