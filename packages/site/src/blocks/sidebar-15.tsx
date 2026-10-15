/**
 * shadcn's `sidebar-15`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-15/`.
 */

import { For, createSignal, dynamic, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Avatar,
  AvatarFallback,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  Calendar,
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
  SidebarSeparator,
  SidebarTrigger,
  srOnly,
  useSidebar,
} from "@barqjs/ui";
import { Apple } from "@barqjs/lucide/icons/apple";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { AudioWaveform } from "@barqjs/lucide/icons/audio-waveform";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Blocks } from "@barqjs/lucide/icons/blocks";
import { BookMarked } from "@barqjs/lucide/icons/book-marked";
import { Brain } from "@barqjs/lucide/icons/brain";
import { Briefcase } from "@barqjs/lucide/icons/briefcase";
import { Calendar as CalendarIcon } from "@barqjs/lucide/icons/calendar";
import { CalendarDays } from "@barqjs/lucide/icons/calendar-days";
import { Camera } from "@barqjs/lucide/icons/camera";
import { ChartColumn } from "@barqjs/lucide/icons/chart-column";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Clapperboard } from "@barqjs/lucide/icons/clapperboard";
import { Command } from "@barqjs/lucide/icons/command";
import { CookingPot } from "@barqjs/lucide/icons/cooking-pot";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Dumbbell } from "@barqjs/lucide/icons/dumbbell";
import { Earth } from "@barqjs/lucide/icons/earth";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Handshake } from "@barqjs/lucide/icons/handshake";
import { House } from "@barqjs/lucide/icons/house";
import { HousePlus } from "@barqjs/lucide/icons/house-plus";
import { Image } from "@barqjs/lucide/icons/image";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { Languages } from "@barqjs/lucide/icons/languages";
import { Link } from "@barqjs/lucide/icons/link";
import { LogOut } from "@barqjs/lucide/icons/log-out";
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
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Wallet } from "@barqjs/lucide/icons/wallet";
import { Wrench } from "@barqjs/lucide/icons/wrench";

import { blockFillsPreview } from "../layout.ts";

const header = css`
  position: sticky;
  top: 0;
  display: flex;
  height: 3.5rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  background: var(--background);
`;

const headerInner = css`
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 0.75rem;
`;

/** `align-self` with it: the separator stretches by default, and a set height alone pins it to the top. */
const rule = css`
  margin-right: 0.5rem;

  &[data-orientation="vertical"] {
    height: 1rem;
    align-self: center;
  }
`;

const oneLine = css`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
`;

const body = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`;

const banner = css`
  margin-inline: auto;
  height: 6rem;
  width: 100%;
  max-width: 48rem;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

/** `h-[100vh]` upstream, and a viewport unit is the window here rather than the preview. */
const panel = css`
  margin-inline: auto;
  min-height: 24rem;
  width: 100%;
  max-width: 48rem;
  flex: 1;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const noRightBorder = css`
  border-right-width: 0;
`;

const teamButton = css`
  width: fit-content;
  padding-inline: 0.375rem;
`;

const teamMark = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--radius) * 0.8);
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

const teamMenu = css`
  width: 16rem;
  border-radius: var(--radius);
`;

const teamsLabel = css`
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

const teamItem = css`
  gap: 0.5rem;
  padding: 0.5rem;
`;

const teamLogo = css`
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.125rem;
  border: 1px solid var(--border);

  & svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
`;

const addLogo = css`
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--radius) * 0.8);
  border: 1px solid var(--border);
  background: var(--background);

  & svg {
    width: 1rem;
    height: 1rem;
  }
`;

const addText = css`
  font-weight: 500;
  color: var(--muted-foreground);
`;

const hiddenAsIcons = css`
  [data-slot="sidebar"][data-collapsible="icon"] & {
    display: none;
  }
`;

const favoriteMenu = css`
  width: 14rem;
  border-radius: var(--radius);
`;

const mutedIcon = css`
  color: var(--muted-foreground);
`;

const quiet = css`
  color: color-mix(in oklab, var(--sidebar-foreground) 70%, transparent);
`;

/** `left-2` over the action's own `right`, which has to be released for the box to move. */
const disclosure = css`
  right: auto;
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

/** `hidden lg:flex`, with `h-svh` left to the height the component already takes from its row. */
const rightSidebar = css`
  position: sticky;
  top: 0;
  display: none;
  border-left: 1px solid var(--border);

  @container preview (width >= 64rem) {
    display: flex;
  }
`;

const userHeader = css`
  height: 4rem;
  border-bottom: 1px solid var(--sidebar-border);
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

const flushInline = css`
  padding-inline: 0;
`;

const flushBlock = css`
  padding-block: 0;
`;

const fullRule = css`
  margin-inline: 0;
`;

/** `[&_[role=gridcell].bg-accent]` upstream is today's cell, which this calendar marks with `data-today`. */
const datePicker = css`
  & [data-slot="calendar-day"] {
    width: 33px;
  }

  & [data-slot="calendar-day"][data-today] {
    background: var(--sidebar-primary);
    color: var(--sidebar-primary-foreground);
  }
`;

const calendarLabel = css`
  width: 100%;
  font-size: 0.875rem;
  color: var(--sidebar-foreground);

  &:hover {
    background: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }

  & svg {
    margin-inline-start: auto;
    transition-property: rotate;
    transition-duration: 200ms;
  }

  &[data-state="open"] svg {
    rotate: 90deg;
  }
`;

const swatch = css`
  display: flex;
  aspect-ratio: 1 / 1;
  width: 1rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.125rem;
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-primary-foreground);

  & svg {
    display: none;
    width: 0.75rem;
    height: 0.75rem;
  }

  &[data-active="true"] {
    border-color: var(--sidebar-primary);
    background: var(--sidebar-primary);
  }

  &[data-active="true"] svg {
    display: block;
  }
`;

type Icon = typeof Command;

const USER = { name: "salama", email: "m@example.com", initials: "SA" };

interface Team {
  readonly id: string;
  readonly name: string;
  readonly logo: Icon;
  readonly shortcut: string;
}

const TEAMS: readonly Team[] = [
  { id: "acme-inc", name: "Acme Inc", logo: Command, shortcut: "⌘1" },
  { id: "acme-corp", name: "Acme Corp.", logo: AudioWaveform, shortcut: "⌘2" },
  { id: "evil-corp", name: "Evil Corp.", logo: Command, shortcut: "⌘3" },
];

/** The menu's rows: every team, then the one row that is not a team. */
const NAV_MAIN: readonly {
  readonly title: string;
  readonly url: string;
  readonly icon: Icon;
  readonly isActive?: boolean;
}[] = [
  { title: "Search", url: "#", icon: Search },
  { title: "Ask AI", url: "#", icon: Sparkles },
  { title: "Home", url: "#", icon: House, isActive: true },
  { title: "Inbox", url: "#", icon: Inbox },
];

interface SecondaryItem {
  readonly title: string;
  readonly url: string;
  readonly icon: Icon;
  readonly badge?: string;
}

const NAV_SECONDARY: readonly SecondaryItem[] = [
  { title: "Calendar", url: "#", icon: CalendarIcon },
  { title: "Settings", url: "#", icon: Settings2 },
  { title: "Templates", url: "#", icon: Blocks },
  { title: "Trash", url: "#", icon: Trash2 },
  { title: "Help", url: "#", icon: MessageCircleQuestionMark },
];

interface Page {
  readonly name: string;
  readonly url: string;
  readonly icon: Icon;
}

const FAVORITES: readonly Page[] = [
  { name: "Project Management & Task Tracking", url: "#", icon: ChartColumn },
  { name: "Family Recipe Collection & Meal Planning", url: "#", icon: CookingPot },
  { name: "Fitness Tracker & Workout Routines", url: "#", icon: Dumbbell },
  { name: "Book Notes & Reading List", url: "#", icon: BookMarked },
  { name: "Sustainable Gardening Tips & Plant Care", url: "#", icon: Sprout },
  { name: "Language Learning Progress & Resources", url: "#", icon: Languages },
  { name: "Home Renovation Ideas & Budget Tracker", url: "#", icon: House },
  { name: "Personal Finance & Investment Portfolio", url: "#", icon: PiggyBank },
  { name: "Movie & TV Show Watchlist with Reviews", url: "#", icon: Clapperboard },
  { name: "Daily Habit Tracker & Goal Setting", url: "#", icon: CircleCheck },
];

interface Workspace {
  readonly name: string;
  readonly icon: Icon;
  readonly pages: readonly Page[];
}

const WORKSPACES: readonly Workspace[] = [
  {
    name: "Personal Life Management",
    icon: House,
    pages: [
      { name: "Daily Journal & Reflection", url: "#", icon: NotebookPen },
      { name: "Health & Wellness Tracker", url: "#", icon: Apple },
      { name: "Personal Growth & Learning Goals", url: "#", icon: Star },
    ],
  },
  {
    name: "Professional Development",
    icon: Briefcase,
    pages: [
      { name: "Career Objectives & Milestones", url: "#", icon: Target },
      { name: "Skill Acquisition & Training Log", url: "#", icon: Brain },
      { name: "Networking Contacts & Events", url: "#", icon: Handshake },
    ],
  },
  {
    name: "Creative Projects",
    icon: Palette,
    pages: [
      { name: "Writing Ideas & Story Outlines", url: "#", icon: PenLine },
      { name: "Art & Design Portfolio", url: "#", icon: Image },
      { name: "Music Composition & Practice Log", url: "#", icon: Music },
    ],
  },
  {
    name: "Home Management",
    icon: HousePlus,
    pages: [
      { name: "Household Budget & Expense Tracking", url: "#", icon: Wallet },
      { name: "Home Maintenance Schedule & Tasks", url: "#", icon: Wrench },
      { name: "Family Calendar & Event Planning", url: "#", icon: CalendarDays },
    ],
  },
  {
    name: "Travel & Adventure",
    icon: Luggage,
    pages: [
      { name: "Trip Planning & Itineraries", url: "#", icon: MapIcon },
      { name: "Travel Bucket List & Inspiration", url: "#", icon: Earth },
      { name: "Travel Journal & Photo Gallery", url: "#", icon: Camera },
    ],
  },
];

interface CalendarGroup {
  readonly name: string;
  readonly open: boolean;
  readonly items: readonly { readonly name: string; readonly active: boolean }[];
}

const CALENDARS: readonly CalendarGroup[] = [
  {
    name: "My Calendars",
    open: true,
    items: [
      { name: "Personal", active: true },
      { name: "Work", active: true },
      { name: "Family", active: false },
    ],
  },
  {
    name: "Favorites",
    open: false,
    items: [
      { name: "Holidays", active: true },
      { name: "Birthdays", active: true },
    ],
  },
  {
    name: "Other",
    open: false,
    items: [
      { name: "Travel", active: true },
      { name: "Reminders", active: true },
      { name: "Deadlines", active: false },
    ],
  },
];

function TeamSwitcher() {
  const [team, setTeam] = createSignal(TEAMS[0]!);
  const Logo = dynamic(() => team().logo);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton class={teamButton}>
              <div class={teamMark}>
                <Logo />
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
                <DropdownMenuItem class={teamItem} onSelect={() => setTeam(each)}>
                  <div class={teamLogo}>
                    <each.logo />
                  </div>
                  {each.name}
                  <DropdownMenuShortcut>{each.shortcut}</DropdownMenuShortcut>
                </DropdownMenuItem>
              )}
            </For>
            <DropdownMenuSeparator />
            <DropdownMenuItem class={teamItem}>
              <div class={addLogo}>
                <Plus />
              </div>
              <div class={addText}>Add team</div>
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
            <SidebarMenuButton href={item.url} isActive={item.isActive === true}>
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </For>
    </SidebarMenu>
  );
}

function NavFavorites() {
  const sidebar = useSidebar();

  return (
    <SidebarGroup class={hiddenAsIcons}>
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarMenu>
        <For each={() => FAVORITES}>
          {(item: Page) => (
            <SidebarMenuItem>
              <SidebarMenuButton href={item.url} title={item.name}>
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
                  aria-label="Favorite actions"
                  class={favoriteMenu}
                  placement={() => (sidebar.isMobile() ? "bottom end" : "right top")}
                >
                  <DropdownMenuItem>
                    <StarOff class={mutedIcon} />
                    <span>Remove from Favorites</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Link class={mutedIcon} />
                    <span>Copy Link</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ArrowUpRight class={mutedIcon} />
                    <span>Open in New Tab</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Trash2 class={mutedIcon} />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </For>
        <SidebarMenuItem>
          <SidebarMenuButton class={quiet}>
            <Ellipsis />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** A component per row, so each row owns the signal its chevron toggles. */
function WorkspaceRow(props: Incoming<{ workspace: Workspace }>) {
  const workspace = props.workspace();
  const WorkspaceIcon = workspace.icon;

  return (
    <SidebarMenuItem>
      <Collapsible>
        <SidebarMenuButton href="#">
          <WorkspaceIcon />
          <span>{workspace.name}</span>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction class={disclosure} showOnHover aria-label={`Toggle ${workspace.name}`}>
            <ChevronRight />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <SidebarMenuAction showOnHover aria-label={`Add a page to ${workspace.name}`}>
          <Plus />
        </SidebarMenuAction>
        <CollapsibleContent>
          <SidebarMenuSub>
            <For each={() => workspace.pages}>
              {(page: Page) => (
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton href={page.url}>
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
            <SidebarMenuButton class={quiet}>
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
            {(item: SecondaryItem) => (
              <SidebarMenuItem>
                <SidebarMenuButton href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
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

function SidebarLeft() {
  return (
    <Sidebar class={noRightBorder}>
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
            placement={() => (sidebar.isMobile() ? "bottom" : "right top")}
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

function DatePicker() {
  return (
    <SidebarGroup class={flushInline}>
      <SidebarGroupContent>
        <Calendar aria-label="Date" class={datePicker} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function Calendars() {
  return (
    <For each={() => CALENDARS}>
      {(calendar: CalendarGroup) => (
        <>
          <SidebarGroup class={flushBlock}>
            <Collapsible defaultExpanded={calendar.open}>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel class={calendarLabel}>
                  {calendar.name}
                  <ChevronRight />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <For each={() => calendar.items}>
                      {(item: CalendarGroup["items"][number]) => (
                        <SidebarMenuItem>
                          <SidebarMenuButton>
                            <div class={swatch} data-active={item.active ? "true" : "false"}>
                              <Check />
                            </div>
                            {item.name}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                    </For>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
          <SidebarSeparator class={fullRule} />
        </>
      )}
    </For>
  );
}

function SidebarRight() {
  return (
    <Sidebar collapsible="none" class={rightSidebar}>
      <SidebarHeader class={userHeader}>
        <NavUser />
      </SidebarHeader>
      <SidebarContent>
        <DatePicker />
        <SidebarSeparator class={fullRule} />
        <Calendars />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Plus />
              <span>New Calendar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Sidebar15() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <SidebarLeft />
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
        </header>
        <div class={body}>
          <div class={banner} />
          <div class={panel} />
        </div>
      </SidebarInset>
      <SidebarRight />
    </SidebarProvider>
  );
}
