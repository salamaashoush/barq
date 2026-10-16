/**
 * shadcn's `sidebar-09`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-09/`.
 */

import { For, createSignal } from "@barqjs/core";
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
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  Switch,
  useSidebar,
} from "@barqjs/ui";
import { ArchiveX } from "@barqjs/lucide/icons/archive-x";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bell } from "@barqjs/lucide/icons/bell";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { Command } from "@barqjs/lucide/icons/command";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { File } from "@barqjs/lucide/icons/file";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { LogOut } from "@barqjs/lucide/icons/log-out";
import { Send } from "@barqjs/lucide/icons/send";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import { Trash } from "@barqjs/lucide/icons/trash";
import { blockFillsPreview } from "../layout.ts";

const outer = css`
  overflow: hidden;

  & > [data-sidebar="sidebar"] {
    flex-direction: row;
  }
`;

const iconRail = css`
  width: calc(var(--sidebar-width-icon) + 1px) !important;
  border-right: 1px solid var(--border);
`;

const compactButton = css`
  @container preview (width >= 48rem) {
    height: 2rem;
    padding: 0;
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

const railGroup = css`
  padding-inline: 0.375rem;

  @container preview (width >= 48rem) {
    padding-inline: 0;
  }
`;

const railButton = css`
  padding-inline: 0.625rem;

  @container preview (width >= 48rem) {
    padding-inline: 0.5rem;
  }
`;

const listColumn = css`
  display: none;
  flex: 1;

  @container preview (width >= 48rem) {
    display: flex;
  }
`;

const listHeader = css`
  gap: 0.875rem;
  border-bottom: 1px solid var(--border);
  padding: 1rem;
`;

const listTop = css`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
`;

const listTitle = css`
  font-size: 1rem;
  font-weight: 500;
  color: var(--foreground);
`;

const unreads = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
`;

const flat = css`
  box-shadow: none;
`;

const listGroup = css`
  padding-inline: 0;
`;

const mailRow = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25;
  white-space: nowrap;
  color: inherit;
  text-decoration: none;

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: var(--sidebar-accent);
    color: var(--sidebar-accent-foreground);
  }
`;

const mailTop = css`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
`;

const mailDate = css`
  margin-left: auto;
  font-size: 0.75rem;
`;

const mailSubject = css`
  font-weight: 500;
`;

const mailTeaser = css`
  display: -webkit-box;
  width: 260px;
  overflow: hidden;
  font-size: 0.75rem;
  white-space: break-spaces;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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

const header = css`
  position: sticky;
  top: 0;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  padding: 1rem;
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
`;

const strip = css`
  aspect-ratio: 16 / 9;
  height: 3rem;
  width: 100%;
  border-radius: var(--radius);
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const USER = { name: "salama", email: "m@example.com", initials: "SA" };

const NAV_MAIN = [
  { id: "inbox", name: "Inbox", icon: Inbox },
  { id: "drafts", name: "Drafts", icon: File },
  { id: "sent", name: "Sent", icon: Send },
  { id: "junk", name: "Junk", icon: ArchiveX },
  { id: "trash", name: "Trash", icon: Trash },
];

interface Mail {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly date: string;
  readonly teaser: string;
}

const MAILS: readonly Mail[] = [
  {
    name: "William Smith",
    email: "williamsmith@example.com",
    subject: "Meeting Tomorrow",
    date: "09:34 AM",
    teaser:
      "Hi team, just a reminder about our meeting tomorrow at 10 AM.\nPlease come prepared with your project updates.",
  },
  {
    name: "Alice Smith",
    email: "alicesmith@example.com",
    subject: "Re: Project Update",
    date: "Yesterday",
    teaser:
      "Thanks for the update. The progress looks great so far.\nLet's schedule a call to discuss the next steps.",
  },
  {
    name: "Bob Johnson",
    email: "bobjohnson@example.com",
    subject: "Weekend Plans",
    date: "2 days ago",
    teaser:
      "Hey everyone! I'm thinking of organizing a team outing this weekend.\nWould you be interested in a hiking trip or a beach day?",
  },
  {
    name: "Emily Davis",
    email: "emilydavis@example.com",
    subject: "Re: Question about Budget",
    date: "2 days ago",
    teaser:
      "I've reviewed the budget numbers you sent over.\nCan we set up a quick call to discuss some potential adjustments?",
  },
  {
    name: "Michael Wilson",
    email: "michaelwilson@example.com",
    subject: "Important Announcement",
    date: "1 week ago",
    teaser:
      "Please join us for an all-hands meeting this Friday at 3 PM.\nWe have some exciting news to share about the company's future.",
  },
  {
    name: "Sarah Brown",
    email: "sarahbrown@example.com",
    subject: "Re: Feedback on Proposal",
    date: "1 week ago",
    teaser:
      "Thank you for sending over the proposal. I've reviewed it and have some thoughts.\nCould we schedule a meeting to discuss my feedback in detail?",
  },
  {
    name: "David Lee",
    email: "davidlee@example.com",
    subject: "New Project Idea",
    date: "1 week ago",
    teaser:
      "I've been brainstorming and came up with an interesting project concept.\nDo you have time this week to discuss its potential impact and feasibility?",
  },
  {
    name: "Olivia Wilson",
    email: "oliviawilson@example.com",
    subject: "Vacation Plans",
    date: "1 week ago",
    teaser:
      "Just a heads up that I'll be taking a two-week vacation next month.\nI'll make sure all my projects are up to date before I leave.",
  },
  {
    name: "James Martin",
    email: "jamesmartin@example.com",
    subject: "Re: Conference Registration",
    date: "1 week ago",
    teaser:
      "I've completed the registration for the upcoming tech conference.\nLet me know if you need any additional information from my end.",
  },
  {
    name: "Sophia White",
    email: "sophiawhite@example.com",
    subject: "Team Dinner",
    date: "1 week ago",
    teaser:
      "To celebrate our recent project success, I'd like to organize a team dinner.\nAre you available next Friday evening? Please let me know your preferences.",
  },
];

function NavUser() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <SidebarMenuButton size="lg" class={compactButton}>
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

function AppSidebar() {
  const sidebar = useSidebar();
  const [active, setActive] = createSignal(NAV_MAIN[0]!);
  const [mails, setMails] = createSignal<readonly Mail[]>(MAILS);

  // Upstream's stand-in for a mailbox per folder: a different handful each time.
  const open = (item: (typeof NAV_MAIN)[number]): void => {
    setActive(item);
    const shuffled = MAILS.toSorted(() => Math.random() - 0.5);
    setMails(shuffled.slice(0, Math.max(5, Math.floor(Math.random() * 10) + 1)));
    sidebar.setOpen(true);
  };

  return (
    <Sidebar collapsible="icon" class={outer}>
      <Sidebar collapsible="none" class={iconRail}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" href="#" class={compactButton}>
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
          <SidebarGroup>
            <SidebarGroupContent class={railGroup}>
              <SidebarMenu>
                <For each={() => NAV_MAIN}>
                  {(item: (typeof NAV_MAIN)[number]) => (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={{ children: item.name, hidden: false }}
                        onClick={() => open(item)}
                        isActive={active().id === item.id}
                        class={railButton}
                      >
                        <item.icon />
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </For>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>

      <Sidebar collapsible="none" class={listColumn}>
        <SidebarHeader class={listHeader}>
          <div class={listTop}>
            <div class={listTitle} data-slot="mail-folder">
              {active().name}
            </div>
            <Label class={unreads}>
              <span>Unreads</span>
              <Switch class={flat} />
            </Label>
          </div>
          <SidebarInput placeholder="Type to search..." />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup class={listGroup}>
            <SidebarGroupContent>
              <For each={() => mails()}>
                {(mail: Mail) => (
                  <a href="#" class={mailRow} data-slot="mail">
                    <div class={mailTop}>
                      <span>{mail.name}</span> <span class={mailDate}>{mail.date}</span>
                    </div>
                    <span class={mailSubject}>{mail.subject}</span>
                    <span class={mailTeaser}>{mail.teaser}</span>
                  </a>
                )}
              </For>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  );
}

const STRIPS = Array.from({ length: 24 }, (_, index) => index);

export function Sidebar09() {
  return (
    <SidebarProvider class={blockFillsPreview} style={{ "--sidebar-width": "350px" }}>
      <AppSidebar />
      <SidebarInset>
        <header class={header}>
          <SidebarTrigger class={trigger} />
          <Separator orientation="vertical" class={rule} />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem class={wideOnly}>
                <BreadcrumbLink href="#">All Inboxes</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator class={wideOnly} />
              <BreadcrumbItem>
                <BreadcrumbPage>Inbox</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div class={body}>
          <For each={() => STRIPS}>{() => <div class={strip} />}</For>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
