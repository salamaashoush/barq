/**
 * shadcn's `sidebar-13`, ported from
 * `apps/v4/registry/new-york-v4/blocks/sidebar-13/`.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  cn,
  srOnly,
} from "@barqjs/ui";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Check } from "@barqjs/lucide/icons/check";
import { Globe } from "@barqjs/lucide/icons/globe";
import { House } from "@barqjs/lucide/icons/house";
import { Keyboard } from "@barqjs/lucide/icons/keyboard";
import { Link } from "@barqjs/lucide/icons/link";
import { Lock } from "@barqjs/lucide/icons/lock";
import { Menu } from "@barqjs/lucide/icons/menu";
import { MessageCircle } from "@barqjs/lucide/icons/message-circle";
import { Paintbrush } from "@barqjs/lucide/icons/paintbrush";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Video } from "@barqjs/lucide/icons/video";
import { blockFillsPreview } from "../layout.ts";

const page = css`
  display: flex;
  align-items: center;
  justify-content: center;
`;

/*
 * Media queries from here down, where every other block asks the preview's
 * container: the dialog is portalled to the body, outside that container, so a
 * container query inside it never matches.
 */
const dialog = css`
  overflow: hidden;
  padding: 0;

  @media (width >= 48rem) {
    max-height: 500px;
    max-width: 700px;
  }
  @media (width >= 64rem) {
    max-width: 800px;
  }
`;

const frame = css`
  align-items: flex-start;
`;

const nav = css`
  display: none;

  @media (width >= 48rem) {
    display: flex;
  }
`;

const main = css`
  display: flex;
  height: 480px;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
`;

const header = css`
  display: flex;
  height: 4rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  transition-property: width, height;
  transition-timing-function: linear;

  [data-slot="sidebar-wrapper"]:has([data-collapsible="icon"]) & {
    height: 3rem;
  }
`;

const headerInner = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 1rem;
`;

const wideOnly = css`
  display: none;

  @media (width >= 48rem) {
    display: block;
  }
`;

const body = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
  padding-top: 0;
`;

const tile = css`
  aspect-ratio: 16 / 9;
  max-width: 48rem;
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: color-mix(in oklab, var(--muted) 50%, transparent);
`;

const CURRENT = "Messages & media";

const NAV = [
  { name: "Notifications", icon: Bell },
  { name: "Navigation", icon: Menu },
  { name: "Home", icon: House },
  { name: "Appearance", icon: Paintbrush },
  { name: CURRENT, icon: MessageCircle },
  { name: "Language & region", icon: Globe },
  { name: "Accessibility", icon: Keyboard },
  { name: "Mark as read", icon: Check },
  { name: "Audio & video", icon: Video },
  { name: "Connected accounts", icon: Link },
  { name: "Privacy & visibility", icon: Lock },
  { name: "Advanced", icon: Settings },
];

const TILES = Array.from({ length: 10 }, (_, index) => index);

function SettingsDialog() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger>
        <Button size="sm">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent class={dialog}>
        <DialogTitle class={srOnly}>Settings</DialogTitle>
        <DialogDescription class={srOnly}>Customize your settings here.</DialogDescription>
        <SidebarProvider class={frame}>
          <Sidebar collapsible="none" class={nav}>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <For each={() => NAV}>
                      {(item: (typeof NAV)[number]) => (
                        <SidebarMenuItem>
                          <SidebarMenuButton href="#" isActive={item.name === CURRENT}>
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
          </Sidebar>
          <main class={main}>
            <header class={header}>
              <div class={headerInner}>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem class={wideOnly}>
                      <BreadcrumbLink href="#">Settings</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator class={wideOnly} />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{CURRENT}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div class={body}>
              <For each={() => TILES}>{() => <div class={tile} />}</For>
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}

export function Sidebar13() {
  return (
    <div class={cn(blockFillsPreview, page)} data-slot="sidebar-13">
      <SettingsDialog />
    </div>
  );
}
