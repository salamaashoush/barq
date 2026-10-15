/**
 * shadcn's `sidebar-12`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-12/`.
 */

import { For } from "@barqjs/core";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@barqjs/ui";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";

import { blockFillsPreview } from "../layout.ts";

const header = css`
  position: sticky;
  top: 0;
  display: flex;
  height: 4rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  padding-inline: 1rem;
`;

const trigger = css`
  margin-left: -0.25rem;
`;

/** `align-self` with it: the separator stretches by default, and a set height alone pins it to the top. */
const rule = css`
  margin-right: 0.5rem;

  &[data-orientation="vertical"] {
    height: 1rem;
    align-self: center;
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
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
`;

const tile = css`
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
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
  border-radius: calc(var(--radius) * 0.6);
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

const USER = { name: "salama", email: "m@example.com", initials: "SA" };

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

function AppSidebar() {
  return (
    <Sidebar>
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
      <SidebarRail />
    </Sidebar>
  );
}

const TILES = Array.from({ length: 20 }, (_, index) => index);

export function Sidebar12() {
  return (
    <SidebarProvider class={blockFillsPreview}>
      <AppSidebar />
      <SidebarInset>
        <header class={header}>
          <SidebarTrigger class={trigger} />
          <Separator orientation="vertical" class={rule} />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>October 2024</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div class={body}>
          <div class={tiles}>
            <For each={() => TILES}>{() => <div class={tile} />}</For>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
