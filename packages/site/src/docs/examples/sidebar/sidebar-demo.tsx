import { For, createSignal, dynamic } from "@barqjs/core";
import { css } from "@barqjs/css";
import { AudioWaveform } from "@barqjs/lucide/icons/audio-waveform";
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
import { Forward } from "@barqjs/lucide/icons/forward";
import { Frame } from "@barqjs/lucide/icons/frame";
import { GalleryVerticalEnd } from "@barqjs/lucide/icons/gallery-vertical-end";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Settings2 } from "@barqjs/lucide/icons/settings-2";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { SquareTerminal } from "@barqjs/lucide/icons/square-terminal";
import { Trash } from "@barqjs/lucide/icons/trash";
import {
  Avatar,
  AvatarFallback,
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
  srOnly,
  useSidebar,
} from "@barqjs/ui";

const teams = [
  { name: "Acme Inc", logo: GalleryVerticalEnd, plan: "Enterprise" },
  { name: "Acme Corp.", logo: AudioWaveform, plan: "Startup" },
  { name: "Evil Corp.", logo: Command, plan: "Free" },
];

const navMain = [
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

const projects = [
  { name: "Design Engineering", url: "#", icon: Frame },
  { name: "Sales & Marketing", url: "#", icon: ChartPie },
  { name: "Travel", url: "#", icon: MapIcon },
];

const user = {
  name: "salama",
  email: "salama@example.com",
};

/**
 * `transform` makes the fixed sidebar resolve against this box rather than the
 * viewport, and the provider's `min-height` is the box's rather than the
 * screen's, which is right for a page shell and wrong in a card.
 */
const frame = css`
  position: relative;
  height: 32rem;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transform: translateZ(0);
`;

const fill = css`
  min-height: 100%;
  height: 100%;
`;

const header = css`
  display: flex;
  height: calc(var(--spacing) * 16);
  flex-shrink: 0;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  transition:
    width 200ms linear,
    height 200ms linear;

  [data-collapsible="icon"] ~ * & {
    height: calc(var(--spacing) * 12);
  }
`;

const headerInner = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding-inline: calc(var(--spacing) * 4);
`;

const nudge = css`
  margin-inline-start: calc(var(--spacing) * -1);
`;

const opened = css`
  &[data-state="open"] {
    background-color: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
`;

const logo = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: calc(var(--spacing) * 8);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background-color: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);

  & > svg {
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
  }
`;

const lines = css`
  display: grid;
  flex: 1;
  text-align: start;
  font-size: 0.875rem;
  line-height: 1.25;
`;

const strong = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
`;

const small = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
`;

const end = css`
  margin-inline-start: auto;
`;

const chevron = css`
  margin-inline-start: auto;
  transition: transform 200ms;

  [data-state="open"] > [data-slot="sidebar-menu-button"] > & {
    transform: rotate(90deg);
  }

  [dir="rtl"] & {
    transform: rotate(180deg);
  }

  [dir="rtl"] [data-state="open"] > [data-slot="sidebar-menu-button"] > & {
    transform: rotate(90deg);
  }
`;

const iconOnly = css`
  [data-collapsible="icon"] & {
    display: none;
  }
`;

const faded = css`
  color: color-mix(in oklab, var(--sidebar-foreground) 70%, transparent);
`;

const muted = css`
  color: var(--muted-foreground);
`;

const wideMenu = css`
  width: var(--barq-trigger-width);
  min-width: calc(var(--spacing) * 56);
  border-radius: var(--radius-lg);
`;

const projectMenu = css`
  width: calc(var(--spacing) * 48);
  border-radius: var(--radius-lg);
`;

const teamsLabel = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

const teamRow = css`
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 2);
`;

const teamLogo = css`
  display: flex;
  width: calc(var(--spacing) * 6);
  height: calc(var(--spacing) * 6);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);

  & > svg {
    width: calc(var(--spacing) * 3.5);
    height: calc(var(--spacing) * 3.5);
    flex-shrink: 0;
  }
`;

const addTeam = css`
  font-weight: 500;
  color: var(--muted-foreground);
`;

const userLabel = css`
  padding: 0;
  font-weight: 400;
`;

const userCard = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 1);
  text-align: start;
  font-size: 0.875rem;
`;

const square = css`
  height: calc(var(--spacing) * 8);
  width: calc(var(--spacing) * 8);
  border-radius: var(--radius-lg);
`;

function TeamSwitcher() {
  const sidebar = useSidebar();
  const [activeTeam, setActiveTeam] = createSignal(teams[0]!);
  const Logo = dynamic(() => activeTeam().logo);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton size="lg" class={opened}>
              <div class={logo}>
                <Logo />
              </div>
              <div class={lines}>
                <span class={strong}>{activeTeam().name}</span>
                <span class={small}>{activeTeam().plan}</span>
              </div>
              <ChevronsUpDown class={end} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class={wideMenu}
            align="start"
            side={sidebar.isMobile() ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel class={teamsLabel}>Teams</DropdownMenuLabel>
              <For each={teams}>
                {(team: (typeof teams)[number], index: () => number) => (
                  <DropdownMenuItem onSelect={() => setActiveTeam(team)} class={teamRow}>
                    <div class={teamLogo}>
                      <team.logo />
                    </div>
                    {team.name}
                    <DropdownMenuShortcut>⌘{index() + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem class={teamRow}>
                <div class={teamLogo}>
                  <Plus />
                </div>
                <div class={addTeam}>Add team</div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        <For each={navMain}>
          {(item: (typeof navMain)[number]) => (
            <Collapsible
              defaultOpen={item.isActive === true}
              render={(root) => (
                <SidebarMenuItem {...root.props} ref={root.ref}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title}>
                      <item.icon />
                      <span>{item.title}</span>
                      <ChevronRight class={chevron} />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <For each={item.items}>
                        {(subItem: (typeof item.items)[number]) => (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton href={subItem.url}>
                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </For>
                    </SidebarMenuSub>
                  </CollapsibleContent>
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
    <SidebarGroup class={iconOnly}>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        <For each={projects}>
          {(item: (typeof projects)[number]) => (
            <SidebarMenuItem>
              <SidebarMenuButton href={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuAction showOnHover>
                    <Ellipsis />
                    <span class={srOnly}>More</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  class={projectMenu}
                  side={sidebar.isMobile() ? "bottom" : "right"}
                  align={sidebar.isMobile() ? "end" : "start"}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <Folder class={muted} />
                      <span>View Project</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Forward class={muted} />
                      <span>Share Project</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <Trash class={muted} />
                      <span>Delete Project</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </For>
        <SidebarMenuItem>
          <SidebarMenuButton class={faded}>
            <Ellipsis class={faded} />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
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
            <SidebarMenuButton size="lg" class={opened}>
              <Avatar class={square}>
                <AvatarFallback class={square}>SA</AvatarFallback>
              </Avatar>
              <div class={lines}>
                <span class={strong}>{user.name}</span>
                <span class={small}>{user.email}</span>
              </div>
              <ChevronsUpDown class={end} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class={wideMenu}
            side={sidebar.isMobile() ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel class={userLabel}>
                <div class={userCard}>
                  <Avatar class={square}>
                    <AvatarFallback class={square}>SA</AvatarFallback>
                  </Avatar>
                  <div class={lines}>
                    <span class={strong}>{user.name}</span>
                    <span class={small}>{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
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
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export default function SidebarDemo() {
  return (
    <div class={frame}>
      <SidebarProvider class={fill}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <TeamSwitcher />
          </SidebarHeader>
          <SidebarContent>
            <NavMain />
            <NavProjects />
          </SidebarContent>
          <SidebarFooter>
            <NavUser />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header class={header}>
            <div class={headerInner}>
              <SidebarTrigger class={nudge} />
            </div>
          </header>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
