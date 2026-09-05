/**
 * Getting around: a rail, a tab strip, a crumb trail, a pager.
 *
 * `Sidebar` and `Resizable` take a frame of their own here, and the frames are
 * not decoration. `sidebar-container` is `position: fixed`, which resolves
 * against the VIEWPORT unless an ancestor makes a containing block, so a demo
 * without one covers the whole page instead of sitting in its card. A real
 * application wants the viewport behaviour, which is why the component does not
 * do this for itself.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { AtSign } from "@barqjs/lucide/icons/at-sign";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { Search } from "@barqjs/lucide/icons/search";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Card,
  CardContent,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barqjs/ui";

import { row, wide } from "./shared.ts";

const FAQS = [
  { id: "a", q: "Is it accessible?", a: "Yes. It follows the WAI-ARIA patterns." },
  { id: "b", q: "Is it styled?", a: "Yes, and every rule is yours to change." },
  { id: "c", q: "Is it animated?", a: "Yes, and it respects prefers-reduced-motion." },
];

const LINES = Array.from({ length: 24 }, (_, index) => `Line ${String(index + 1)}`);

const SLIDES = [1, 2, 3, 4, 5];

const SECTIONS = [
  { id: "overview", name: "Overview", body: "What it is, in one paragraph." },
  { id: "usage", name: "Usage", body: "How to reach for it." },
];

export function AccordionDemo() {
  return (
    <div class={wide}>
      <Accordion items={FAQS}>
        {(faq: (typeof FAQS)[number]) => (
          <AccordionItem>
            <AccordionTrigger>{faq.q}</AccordionTrigger>
            <AccordionContent>{faq.a}</AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

export function CollapsibleDemo() {
  return (
    <Collapsible>
      <CollapsibleTrigger>Show details</CollapsibleTrigger>
      <CollapsibleContent>Hidden until asked for.</CollapsibleContent>
    </Collapsible>
  );
}

export function TabsDemo() {
  return (
    <div class={wide}>
      <Tabs items={SECTIONS}>
        <TabsList aria-label="Sections">
          {(section: (typeof SECTIONS)[number]) => <TabsTrigger>{section.name}</TabsTrigger>}
        </TabsList>
        <TabsContent>{(section: (typeof SECTIONS)[number]) => <p>{section.body}</p>}</TabsContent>
      </Tabs>
    </div>
  );
}

export function BreadcrumbDemo() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Billing</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Invoices</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function PaginationDemo() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            1
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

const menuBox = css`
  display: flex;
  min-height: 12rem;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
`;

export function NavigationMenuDemo() {
  return (
    <div class={menuBox}>
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#" isActive>
                Analytics
              </NavigationMenuLink>
              <NavigationMenuLink href="#">Reporting</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="solutions">
            <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#">For teams</NavigationMenuLink>
              <NavigationMenuLink href="#">For enterprise</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="pricing">
            <NavigationMenuTrigger>Pricing</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#">Plans</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuIndicator />
        <NavigationMenuViewport />
      </NavigationMenu>
    </div>
  );
}

/**
 * `transform: translateZ(0)` is what makes a fixed sidebar resolve against this
 * box rather than the viewport, and `min-height: 100%` overrides the
 * component's own `min-h-svh` — which is right for a page shell and wrong in a
 * card, so the DEMO overrides it rather than the component softening it.
 */
const sidebarFrame = css`
  height: 22rem;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  position: relative;
  transform: translateZ(0);
`;

export function SidebarDemo() {
  return (
    <div class={sidebarFrame}>
      <SidebarProvider style={{ "min-height": "100%", height: "100%" }}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">Acme Inc</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <Inbox />
                      <span>Inbox</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>12</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <FileText />
                      <span>Drafts</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Search />
                      <span>Search</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton>Recent</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton isActive>Saved</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <AtSign />
                  <span>Account</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <div class={row} style={{ padding: "0.75rem" }}>
            <SidebarTrigger />
            <span style={{ "font-size": "0.875rem", color: "var(--muted-foreground)" }}>
              Toggle it, or press Ctrl+B
            </span>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

const resizableFrame = css`
  height: 12rem;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
`;

const panel = css`
  padding: 1rem;
  font-size: 0.875rem;
`;

export function ResizableDemo() {
  return (
    <div class={resizableFrame}>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={30}>
          <div class={panel}>Sidebar</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={60}>
              <div class={panel}>Editor</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40}>
              <div class={panel}>Console</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

const scrollBody = css`
  padding: 0.75rem;
  display: grid;
  gap: 0.5rem;
  font-size: 0.875rem;
`;

export function ScrollAreaDemo() {
  return (
    <ScrollArea aria-label="Log" style={{ height: "12rem", width: "18rem" }}>
      <div class={scrollBody}>
        <For each={() => LINES}>{(line: string) => <div>{line}</div>}</For>
      </div>
    </ScrollArea>
  );
}

const carouselFrame = css`
  width: 100%;
  max-width: 20rem;
  padding-inline: 3rem;
`;

const slide = css`
  display: flex;
  aspect-ratio: 1 / 1;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  font-size: 2rem;
  font-weight: 600;
`;

export function CarouselDemo() {
  return (
    <div class={carouselFrame}>
      <Carousel>
        <CarouselContent>
          <For each={() => SLIDES}>
            {(each: number) => (
              <CarouselItem>
                <Card>
                  <CardContent class={slide}>{each}</CardContent>
                </Card>
              </CarouselItem>
            )}
          </For>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
