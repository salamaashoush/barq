/**
 * shadcn's `sidebar-10`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-10/`.
 */

import { Dynamic, For, createSignal, onSettled, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@barqjs/ui";
import { Apple } from "@barqjs/lucide/icons/apple";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { AudioWaveform } from "@barqjs/lucide/icons/audio-waveform";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Blocks } from "@barqjs/lucide/icons/blocks";
import { Brain } from "@barqjs/lucide/icons/brain";
import { BriefcaseBusiness } from "@barqjs/lucide/icons/briefcase-business";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { CalendarDays } from "@barqjs/lucide/icons/calendar-days";
import { Camera } from "@barqjs/lucide/icons/camera";
import { ChartColumn } from "@barqjs/lucide/icons/chart-column";
import { ChartLine } from "@barqjs/lucide/icons/chart-line";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Clapperboard } from "@barqjs/lucide/icons/clapperboard";
import { Command } from "@barqjs/lucide/icons/command";
import { CookingPot } from "@barqjs/lucide/icons/cooking-pot";
import { Copy } from "@barqjs/lucide/icons/copy";
import { CornerUpLeft } from "@barqjs/lucide/icons/corner-up-left";
import { CornerUpRight } from "@barqjs/lucide/icons/corner-up-right";
import { Dumbbell } from "@barqjs/lucide/icons/dumbbell";
import { Earth } from "@barqjs/lucide/icons/earth";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { GalleryVerticalEnd } from "@barqjs/lucide/icons/gallery-vertical-end";
import { Handshake } from "@barqjs/lucide/icons/handshake";
import { House } from "@barqjs/lucide/icons/house";
import { HousePlus } from "@barqjs/lucide/icons/house-plus";
import { Image } from "@barqjs/lucide/icons/image";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { Languages } from "@barqjs/lucide/icons/languages";
import { Library } from "@barqjs/lucide/icons/library";
import { Link } from "@barqjs/lucide/icons/link";
import { Luggage } from "@barqjs/lucide/icons/luggage";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { MessageCircleQuestionMark } from "@barqjs/lucide/icons/message-circle-question-mark";
import { Music } from "@barqjs/lucide/icons/music";
import { NotebookPen } from "@barqjs/lucide/icons/notebook-pen";
import { Palette } from "@barqjs/lucide/icons/palette";
import { PenLine } from "@barqjs/lucide/icons/pen-line";
import { PiggyBank } from "@barqjs/lucide/icons/piggy-bank";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Search } from "@barqjs/lucide/icons/search";
import { Settings2 } from "@barqjs/lucide/icons/settings-2";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { Sprout } from "@barqjs/lucide/icons/sprout";
import { Star } from "@barqjs/lucide/icons/star";
import { StarOff } from "@barqjs/lucide/icons/star-off";
import { Target } from "@barqjs/lucide/icons/target";
import { Trash } from "@barqjs/lucide/icons/trash";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Wallet } from "@barqjs/lucide/icons/wallet";
import { Wrench } from "@barqjs/lucide/icons/wrench";
import { blockFillsPreview } from "../layout.ts";

const borderless = css`
  border-right: 0;
`;

const header = css`
  display: flex;
  height: 3.5rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
`;

const headerInner = css`
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 0.75rem;
`;

const rule = css`
  margin-right: 0.5rem;

  &[data-orientation="vertical"] {
    height: 1rem;
  }
`;

const oneLine = css`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
`;

const headerActions = css`
  margin-left: auto;
  padding-inline: 0.75rem;
`;

const body = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 2.5rem 1rem;
`;

const banner = css`
  margin-inline: auto;
  height: 6rem;
  width: 100%;
  max-width: 48rem;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const sheet = css`
  margin-inline: auto;
  height: 100%;
  width: 100%;
  max-width: 48rem;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const actions = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
`;

const edited = css`
  display: none;
  font-weight: 500;
  color: var(--muted-foreground);

  @container preview (width >= 48rem) {
    display: inline-block;
  }
`;

const smallButton = css`
  height: 1.75rem;
  width: 1.75rem;

  &[aria-expanded="true"] {
    background: var(--accent);
  }
`;

const actionsPanel = css`
  width: 14rem;
  overflow: hidden;
  border-radius: var(--radius);
  padding: 0;
`;

const clear = css`
  background: transparent;
`;

const actionGroup = css`
  border-bottom: 1px solid var(--border);

  &:last-child {
    border-bottom: 0;
  }
`;

const tight = css`
  gap: 0;
`;

const teamButton = css`
  width: fit-content;
  padding-inline: 0.375rem;
`;

const teamMark = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--radius) - 2px);
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);

  & svg {
    width: 0.75rem;
    height: 0.75rem;
  }
`;

const teamName = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
`;

const faded = css`
  opacity: 0.5;
`;

const teamsLabel = css`
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

const teamMenu = css`
  width: 16rem;
  border-radius: var(--radius);
`;

const teamRow = css`
  gap: 0.5rem;
  padding: 0.5rem;
`;

const teamLogo = css`
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--radius) - 6px);
  border: 1px solid var(--border);

  & svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
`;

const addTeam = css`
  font-weight: 500;
  color: var(--muted-foreground);
`;

const hiddenAsIcons = css`
  [data-collapsible="icon"] & {
    display: none;
  }
`;

const rowMenu = css`
  width: 14rem;
  border-radius: var(--radius);
`;

const quiet = css`
  color: var(--muted-foreground);
`;

const more = css`
  color: color-mix(in oklab, var(--sidebar-foreground) 70%, transparent);
`;

const disclosure = css`
  left: 0.5rem;
  background: var(--sidebar-accent);
  color: var(--sidebar-accent-foreground);

  &[data-state="open"] {
    rotate: 90deg;
  }
`;

const pushedDown = css`
  margin-top: auto;
`;

type Icon = typeof Command;

interface Team {
  readonly id: string;
  readonly name: string;
  readonly logo: Icon;
  readonly plan: string;
  readonly shortcut: string;
}

const TEAMS: readonly Team[] = [
  { id: "acme-inc", name: "Acme Inc", logo: Command, plan: "Enterprise", shortcut: "⌘1" },
  { id: "acme-corp", name: "Acme Corp.", logo: AudioWaveform, plan: "Startup", shortcut: "⌘2" },
  { id: "evil-corp", name: "Evil Corp.", logo: Command, plan: "Free", shortcut: "⌘3" },
];

const NAV_MAIN: readonly {
  readonly id: string;
  readonly name: string;
  readonly icon: Icon;
  readonly active?: boolean;
}[] = [
  { id: "search", name: "Search", icon: Search },
  { id: "ask", name: "Ask AI", icon: Sparkles },
  { id: "home", name: "Home", icon: House, active: true },
  { id: "inbox", name: "Inbox", icon: Inbox },
];

const NAV_SECONDARY: readonly {
  readonly id: string;
  readonly name: string;
  readonly icon: Icon;
  readonly badge?: string;
}[] = [
  { id: "calendar", name: "Calendar", icon: Calendar },
  { id: "settings", name: "Settings", icon: Settings2 },
  { id: "templates", name: "Templates", icon: Blocks },
  { id: "trash", name: "Trash", icon: Trash2 },
  { id: "help", name: "Help", icon: MessageCircleQuestionMark },
];

// Upstream marks each page with an emoji; an icon carries the same hint.
const FAVORITES = [
  { id: "projects", name: "Project Management & Task Tracking", icon: ChartColumn },
  { id: "recipes", name: "Family Recipe Collection & Meal Planning", icon: CookingPot },
  { id: "fitness", name: "Fitness Tracker & Workout Routines", icon: Dumbbell },
  { id: "books", name: "Book Notes & Reading List", icon: Library },
  { id: "gardening", name: "Sustainable Gardening Tips & Plant Care", icon: Sprout },
  { id: "languages", name: "Language Learning Progress & Resources", icon: Languages },
  { id: "renovation", name: "Home Renovation Ideas & Budget Tracker", icon: House },
  { id: "finance", name: "Personal Finance & Investment Portfolio", icon: PiggyBank },
  { id: "watchlist", name: "Movie & TV Show Watchlist with Reviews", icon: Clapperboard },
  { id: "habits", name: "Daily Habit Tracker & Goal Setting", icon: CircleCheck },
];

interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly icon: Icon;
  readonly pages: readonly { readonly id: string; readonly name: string; readonly icon: Icon }[];
}

const WORKSPACES: readonly Workspace[] = [
  {
    id: "personal",
    name: "Personal Life Management",
    icon: House,
    pages: [
      { id: "journal", name: "Daily Journal & Reflection", icon: NotebookPen },
      { id: "health", name: "Health & Wellness Tracker", icon: Apple },
      { id: "growth", name: "Personal Growth & Learning Goals", icon: Star },
    ],
  },
  {
    id: "professional",
    name: "Professional Development",
    icon: BriefcaseBusiness,
    pages: [
      { id: "career", name: "Career Objectives & Milestones", icon: Target },
      { id: "skills", name: "Skill Acquisition & Training Log", icon: Brain },
      { id: "networking", name: "Networking Contacts & Events", icon: Handshake },
    ],
  },
  {
    id: "creative",
    name: "Creative Projects",
    icon: Palette,
    pages: [
      { id: "writing", name: "Writing Ideas & Story Outlines", icon: PenLine },
      { id: "art", name: "Art & Design Portfolio", icon: Image },
      { id: "music", name: "Music Composition & Practice Log", icon: Music },
    ],
  },
  {
    id: "home",
    name: "Home Management",
    icon: HousePlus,
    pages: [
      { id: "budget", name: "Household Budget & Expense Tracking", icon: Wallet },
      { id: "maintenance", name: "Home Maintenance Schedule & Tasks", icon: Wrench },
      { id: "family", name: "Family Calendar & Event Planning", icon: CalendarDays },
    ],
  },
  {
    id: "travel",
    name: "Travel & Adventure",
    icon: Luggage,
    pages: [
      { id: "trips", name: "Trip Planning & Itineraries", icon: MapIcon },
      { id: "bucket-list", name: "Travel Bucket List & Inspiration", icon: Earth },
      { id: "travel-journal", name: "Travel Journal & Photo Gallery", icon: Camera },
    ],
  },
];

interface Action {
  readonly label: string;
  readonly icon: Icon;
}

const PAGE_ACTIONS: readonly (readonly Action[])[] = [
  [
    { label: "Customize Page", icon: Settings2 },
    { label: "Turn into wiki", icon: FileText },
  ],
  [
    { label: "Copy Link", icon: Link },
    { label: "Duplicate", icon: Copy },
    { label: "Move to", icon: CornerUpRight },
    { label: "Move to Trash", icon: Trash2 },
  ],
  [
    { label: "Undo", icon: CornerUpLeft },
    { label: "View analytics", icon: ChartLine },
    { label: "Version History", icon: GalleryVerticalEnd },
    { label: "Show delete pages", icon: Trash },
    { label: "Notifications", icon: Bell },
  ],
  [
    { label: "Import", icon: ArrowUp },
    { label: "Export", icon: ArrowDown },
  ],
];

function TeamSwitcher() {
  const [team, setTeam] = createSignal(TEAMS[0]!);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton class={teamButton}>
              <div class={teamMark}>
                <Dynamic component={team().logo} />
              </div>
              <span class={teamName}>{team().name}</span>
              <ChevronDown class={faded} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            aria-label="Teams"
            class={teamMenu}
            placement="bottom start"
            offset={4}
          >
            <DropdownMenuLabel class={teamsLabel}>Teams</DropdownMenuLabel>
            <For each={() => TEAMS}>
              {(each: Team) => (
                <DropdownMenuItem class={teamRow} onSelect={() => setTeam(each)}>
                  <div class={teamLogo}>
                    <each.logo />
                  </div>
                  {each.name}
                  <DropdownMenuShortcut>{each.shortcut}</DropdownMenuShortcut>
                </DropdownMenuItem>
              )}
            </For>
            <DropdownMenuSeparator />
            <DropdownMenuItem class={teamRow}>
              <div class={teamLogo}>
                <Plus />
              </div>
              <div class={addTeam}>Add team</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavMain() {
  return (
    <SidebarMenu>
      <For each={() => NAV_MAIN}>
        {(item: (typeof NAV_MAIN)[number]) => (
          <SidebarMenuItem>
            <SidebarMenuButton href="#" isActive={item.active === true}>
              <item.icon />
              <span>{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </For>
    </SidebarMenu>
  );
}

function NavFavorites() {
  return (
    <SidebarGroup class={hiddenAsIcons}>
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarMenu>
        <For each={() => FAVORITES}>
          {(item: (typeof FAVORITES)[number]) => (
            <SidebarMenuItem>
              <SidebarMenuButton href="#" title={item.name}>
                <item.icon />
                <span>{item.name}</span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuAction showOnHover aria-label="More">
                    <Ellipsis />
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  aria-label="Favorite actions"
                  class={rowMenu}
                  placement="right top"
                >
                  <DropdownMenuItem>
                    <StarOff class={quiet} />
                    <span>Remove from Favorites</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Link class={quiet} />
                    <span>Copy Link</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ArrowUpRight class={quiet} />
                    <span>Open in New Tab</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Trash2 class={quiet} />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </For>
        <SidebarMenuItem>
          <SidebarMenuButton class={more}>
            <Ellipsis />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

// A component per row: the open state has to belong to the row, and a signal
// held by the loop would be shared by all five.
function WorkspaceRow(props: Incoming<{ workspace: Workspace }>) {
  const workspace = props.workspace();

  return (
    <SidebarMenuItem>
      <Collapsible>
        <SidebarMenuButton href="#">
          <workspace.icon />
          <span>{workspace.name}</span>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction class={disclosure} showOnHover aria-label={`Toggle ${workspace.name}`}>
            <ChevronRight />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <SidebarMenuAction showOnHover aria-label={`Add to ${workspace.name}`}>
          <Plus />
        </SidebarMenuAction>
        <CollapsibleContent>
          <SidebarMenuSub>
            <For each={() => workspace.pages}>
              {(page: Workspace["pages"][number]) => (
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton href="#">
                    <page.icon />
                    <span>{page.name}</span>
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

function NavWorkspaces() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <For each={() => WORKSPACES}>
            {(workspace: Workspace) => <WorkspaceRow workspace={workspace} />}
          </For>
          <SidebarMenuItem>
            <SidebarMenuButton class={more}>
              <Ellipsis />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
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
                <SidebarMenuButton href="#">
                  <item.icon />
                  <span>{item.name}</span>
                </SidebarMenuButton>
                {item.badge === undefined ? null : (
                  <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )}
          </For>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavActions() {
  const [open, setOpen] = createSignal(false);

  // Open once the page has settled rather than from the first render: the
  // panel is positioned against its trigger, which the first render has not
  // laid out.
  onSettled(() => {
    setOpen(true);
  });

  return (
    <div class={actions}>
      <div class={edited}>Edit Oct 08</div>
      <Button variant="ghost" size="icon" class={smallButton} aria-label="Favorite">
        <Star />
      </Button>
      <Popover isOpen={open()} onOpenChange={(next: boolean) => setOpen(next)}>
        <PopoverTrigger>
          <Button variant="ghost" size="icon" class={smallButton} aria-label="Page actions">
            <Ellipsis />
          </Button>
        </PopoverTrigger>
        <PopoverContent class={actionsPanel} placement="bottom end">
          <Sidebar collapsible="none" class={clear}>
            <SidebarContent>
              <For each={() => PAGE_ACTIONS}>
                {(group: readonly Action[]) => (
                  <SidebarGroup class={actionGroup}>
                    <SidebarGroupContent class={tight}>
                      <SidebarMenu>
                        <For each={() => group}>
                          {(item: Action) => (
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <item.icon /> <span>{item.label}</span>
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
          </Sidebar>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function Sidebar10() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <Sidebar class={borderless}>
        <SidebarHeader>
          <TeamSwitcher />
          <NavMain />
        </SidebarHeader>
        <SidebarContent>
          <NavFavorites />
          <NavWorkspaces />
          <NavSecondary />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header class={header}>
          <div class={headerInner}>
            <SidebarTrigger />
            <Separator orientation="vertical" class={rule} />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage class={oneLine}>
                    Project Management & Task Tracking
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div class={headerActions}>
            <NavActions />
          </div>
        </header>
        <div class={body}>
          <div class={banner} />
          <div class={sheet} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
