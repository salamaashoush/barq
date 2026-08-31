/**
 * Every component on one page, for looking at in a real browser.
 *
 * Not a test. The suite asserts on the rules a class produced; this is what a
 * person opens to see whether those rules add up to shadcn's look — the one
 * question no headless DOM can answer.
 */

import { For, render, signal, type Child, type Incoming } from "@barqjs/core";
import { css, globalCss, layer } from "@barqjs/css";

const ui = layer("barq.ui");
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  AspectRatio,
  Avatar,
  AvatarFallback,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ChartBars,
  ChartContainer,
  ChartLegend,
  ChartLines,
  ChartTooltipContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Combobox,
  Command,
  CommandItem,
  CommandShortcut,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Calendar,
  DatePicker,
  DateRangePicker,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Kbd,
  KbdGroup,
  Label,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
  NativeSelect,
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
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  RangeCalendar,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Select,
  SelectItem,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Toaster,
  toast,
  Tooltip,
  TooltipContent,
} from "@barqjs/ui";
import "@barqjs/ui/theme/reset.ts";
import { CalendarDate } from "@barqjs/aria/date";

import { Customizer } from "./customizer.tsx";
import { Showcase } from "./showcase.tsx";
import { design } from "./params.ts";

import { AtSign } from "@barqjs/lucide/icons/at-sign";
import { Bold } from "@barqjs/lucide/icons/bold";
import { Copy } from "@barqjs/lucide/icons/copy";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Search } from "@barqjs/lucide/icons/search";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";

globalCss`
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
  }
`;

/**
 * shadcn's `/create` layout: the preview and the customizer side by side, the
 * customizer docked on the RIGHT. `flex-row-reverse` rather than putting it
 * second in the markup, because the reading order is the preview and the tab
 * order should be the controls.
 */
const designer = css`
  --customizer-width: 13rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100dvh;
  padding: 1.5rem;
  box-sizing: border-box;

  @media (width >= 48rem) {
    flex-direction: row-reverse;
    align-items: stretch;
  }

  @media (width >= 96rem) {
    --customizer-width: 15rem;
  }
`;

const page = css`
  display: grid;
  gap: 2.5rem;
  padding: 1.5rem;
`;

/**
 * The preview is a FRAMED panel, which is shadcn's arrangement and is doing
 * work: a muted surround and a ring separate what is being themed from the
 * page around it, so a light theme on a light page still reads as a thing.
 */
const panel = css`
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-2xl);
  background-color: var(--muted);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent);
  max-height: calc(100dvh - 3rem);
`;

const scroller = css`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--background);
`;

const switcher = css`
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: calc(var(--radius) + 4px);
  background-color: color-mix(in oklab, var(--card) 90%, transparent);
  padding: 0.25rem;
  box-shadow:
    0 20px 25px -5px rgb(0 0 0 / 0.1),
    0 8px 10px -6px rgb(0 0 0 / 0.1);
  backdrop-filter: blur(12px);
`;

const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
`;

const stack = css`
  display: grid;
  gap: 0.75rem;
  max-width: 24rem;
`;

const heading = css`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin: 0 0 0.75rem;
`;

function Section(props: Incoming<{ title?: string; children?: Child }>) {
  return (
    <section data-section={props.title?.()}>
      <h2 class={heading}>{props.title}</h2>
      {props.children}
    </section>
  );
}

const SECTIONS = [
  { id: "overview", name: "Overview", body: "What it is" },
  { id: "usage", name: "Usage", body: "How to use it" },
];

const FAQS = [
  { id: "a", q: "Is it accessible?", a: "Yes. It follows the WAI-ARIA patterns." },
  { id: "b", q: "Is it styled?", a: "Yes, and every rule is yours to change." },
];

/** A big enough area to right-click in, and to measure the menu against. */
const dropzone = css`
  display: flex;
  height: 9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  border: 1px dashed var(--border);
  font-size: 0.875rem;
  color: var(--muted-foreground);
`;

const ACTIONS = [
  { id: "rename", name: "Rename" },
  { id: "duplicate", name: "Duplicate" },
  { id: "delete", name: "Delete" },
];

const PALETTE = [
  { id: "new", name: "New file", keys: "\u2318N" },
  { id: "open", name: "Open file", keys: "\u2318O" },
  { id: "search", name: "Search the project", keys: "\u2318F" },
  { id: "settings", name: "Open settings", keys: "\u2318," },
];

/** Five series, so every step of the ramp is on the page and the picker moves it. */
const CHART_CONFIG = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
  { key: "tablet", label: "Tablet", color: "var(--chart-3)" },
  { key: "watch", label: "Watch", color: "var(--chart-4)" },
  { key: "tv", label: "TV", color: "var(--chart-5)" },
];

const CHART_DATA = [
  { month: "Jan", desktop: 186, mobile: 80, tablet: 45, watch: 20, tv: 12 },
  { month: "Feb", desktop: 305, mobile: 200, tablet: 92, watch: 31, tv: 25 },
  { month: "Mar", desktop: 237, mobile: 120, tablet: 61, watch: 44, tv: 18 },
  { month: "Apr", desktop: 273, mobile: 190, tablet: 78, watch: 25, tv: 30 },
  { month: "May", desktop: 209, mobile: 130, tablet: 55, watch: 38, tv: 22 },
];

const FRUITS = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry" },
];

function Gallery() {
  const progress = signal(62);

  return (
    <main class={page} id="gallery">
      <Section title="Button">
        <div class={row}>
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button isDisabled>Disabled</Button>
        </div>
        <div class={row} style={{ "margin-top": "0.75rem" }}>
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Bold">
            <Bold />
          </Button>
        </div>
      </Section>

      <Section title="Badge">
        <div class={row}>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="ghost">Ghost</Badge>
          <Badge variant="link" href="#">
            Link
          </Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card style={{ "max-width": "24rem" }}>
          <CardHeader bordered>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Everything billed this year.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline">
                New
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>Twelve invoices, four of them unpaid.</CardContent>
          <CardFooter bordered>
            <Button size="sm">Export</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Alert">
        <div class={stack} style={{ "max-width": "32rem" }}>
          <Alert>
            <TriangleAlert />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Your trial ends in three days.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Payment failed</AlertTitle>
            <AlertDescription>The card was declined.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Form">
        <div class={stack}>
          <Label for="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
          <Textarea aria-label="Notes" placeholder="Notes" />
          <NativeSelect aria-label="Country">
            <option>United Kingdom</option>
            <option>Egypt</option>
          </NativeSelect>
          <Select items={FRUITS} aria-label="Fruit" placeholder="Pick one">
            {(fruit: (typeof FRUITS)[number]) => <SelectItem>{fruit.name}</SelectItem>}
          </Select>
          <div class={row}>
            <Checkbox id="terms" />
            <Label for="terms">Accept the terms</Label>
          </div>
          <div class={row}>
            <Checkbox id="mixed" isIndeterminate />
            <Label for="mixed">Some selected</Label>
          </div>
          <RadioGroup label="Size" defaultValue="m">
            <div class={row}>
              <RadioGroupItem value="s" id="s" />
              <Label for="s">Small</Label>
            </div>
            <div class={row}>
              <RadioGroupItem value="m" id="m" />
              <Label for="m">Medium</Label>
            </div>
          </RadioGroup>
          <div class={row}>
            <Switch id="wifi" defaultSelected />
            <Label for="wifi">Wi-Fi</Label>
          </div>
          <Slider aria-label="Volume" defaultValue={30} />
          <Slider aria-label="Price" defaultValue={[20, 60]} />
          <Progress value={progress()} label="Upload" />
          <div class={row}>
            <Toggle aria-label="Bold">
              <Bold />
            </Toggle>
            <Toggle variant="outline" aria-label="Bold outline">
              <Bold />
            </Toggle>
          </div>
        </div>
      </Section>

      <Section title="Overlays">
        <div class={row}>
          <Dialog>
            <DialogTrigger>
              <Button variant="outline">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete the project?</DialogTitle>
                <DialogDescription>This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose>Cancel</DialogClose>
                <Button variant="destructive">Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger>
              <Button variant="destructive">Alert dialog</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>This deletes everything.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger>
              <Button variant="outline">Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
            </SheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger>
              <Button variant="outline">Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Dimensions</PopoverTitle>
              </PopoverHeader>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent items={ACTIONS} aria-label="Actions">
              {(action: (typeof ACTIONS)[number]) => (
                <DropdownMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
                  {action.name}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip delay={200}>
            <Button variant="outline">Tooltip</Button>
            <TooltipContent>Saves to the server</TooltipContent>
          </Tooltip>
        </div>

        <div class={stack} style={{ "max-width": "32rem" }}>
          <ContextMenu>
            <ContextMenuTrigger class={dropzone}>Right-click anywhere in here</ContextMenuTrigger>
            <ContextMenuContent items={ACTIONS} aria-label="Actions">
              {(action: (typeof ACTIONS)[number]) => (
                <ContextMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
                  {action.name}
                  <ContextMenuShortcut>{"\u2318R"}</ContextMenuShortcut>
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </Section>

      <Section title="Calendar">
        <div class={row}>
          <Calendar aria-label="Departure" />
          <RangeCalendar aria-label="Stay" />
        </div>
      </Section>

      <Section title="Resizable">
        <div
          style={{
            height: "12rem",
            width: "100%",
            "max-width": "40rem",
            border: "1px solid var(--border)",
            "border-radius": "var(--radius)",
            overflow: "hidden",
          }}
        >
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={30}>
              <div style={{ padding: "1rem", "font-size": "0.875rem" }}>Sidebar</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70}>
              <ResizablePanelGroup direction="vertical">
                <ResizablePanel defaultSize={60}>
                  <div style={{ padding: "1rem", "font-size": "0.875rem" }}>Editor</div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={40}>
                  <div style={{ padding: "1rem", "font-size": "0.875rem" }}>Console</div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </Section>

      <Section title="Toast">
        <div class={row}>
          <Button variant="outline" onPress={() => toast("Saved")}>
            Default
          </Button>
          <Button variant="outline" onPress={() => toast.success("Everything worked")}>
            Success
          </Button>
          <Button
            variant="outline"
            onPress={() => toast.error("That did not work", { description: "Try again in a bit" })}
          >
            Error
          </Button>
          <Button
            variant="outline"
            onPress={() =>
              toast("Deleted three files", {
                action: { label: "Undo", onAction: () => toast.success("Restored") },
              })
            }
          >
            With an action
          </Button>
          <Button
            variant="outline"
            onPress={() =>
              void toast.promise(new Promise((resolve) => setTimeout(resolve, 1200)), {
                loading: "Saving",
                success: "Saved",
                error: "Failed",
              })
            }
          >
            Promise
          </Button>
        </div>
      </Section>

      <Section title="NavigationMenu">
        <div class={row} style={{ "min-height": "12rem", "align-items": "flex-start" }}>
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
      </Section>

      <Section title="Chart">
        <div class={row} style={{ "align-items": "flex-start" }}>
          <Card style={{ width: "24rem" }}>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Every series is a step of the theme's ramp.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART_CONFIG}>
                <ChartBars data={CHART_DATA} x="month" aria-label="Revenue by month" />
                <ChartLegend />
              </ChartContainer>
            </CardContent>
          </Card>
          <Card style={{ width: "24rem" }}>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART_CONFIG}>
                <ChartLines data={CHART_DATA} x="month" area aria-label="Sessions by month" />
                <ChartLegend />
              </ChartContainer>
            </CardContent>
          </Card>
          <ChartTooltipContent
            label="March"
            items={[
              { key: "desktop", label: "Desktop", value: "1,204" },
              { key: "mobile", label: "Mobile", value: "832" },
            ]}
          />
        </div>
      </Section>

      <Section title="Sidebar">
        <div
          style={{
            height: "22rem",
            border: "1px solid var(--border)",
            "border-radius": "var(--radius)",
            overflow: "hidden",
            position: "relative",
            // `sidebar-container` is `position: fixed`, which resolves against
            // the VIEWPORT unless an ancestor makes a containing block. Without
            // this the demo sidebar covers the whole page rather than sitting in
            // its box. A real application wants the viewport behaviour, which is
            // why the component does not do this for itself.
            transform: "translateZ(0)",
          }}
        >
          {/* `min-h-svh` is right for a page shell and wrong in a box, so the
              DEMO overrides it rather than the component softening it. */}
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
                <SidebarGroup>
                  <SidebarGroupLabel>Loading</SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenu>
                </SidebarGroup>
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
      </Section>

      <Section title="InputOTP">
        <div class={row}>
          <InputOTP maxLength={6}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
      </Section>

      <Section title="DatePicker">
        <div class={row}>
          <DatePicker />
          <DatePicker defaultValue={new CalendarDate(2022, 1, 20)} />
          <DateRangePicker
            defaultValue={{
              start: new CalendarDate(2022, 1, 20),
              end: new CalendarDate(2022, 2, 9),
            }}
          />
        </div>
      </Section>

      <Section title="Disclosure">
        <div class={stack} style={{ "max-width": "32rem" }}>
          <Tabs items={SECTIONS}>
            <TabsList aria-label="Sections">
              {(section: (typeof SECTIONS)[number]) => <TabsTrigger>{section.name}</TabsTrigger>}
            </TabsList>
            <TabsContent>
              {(section: (typeof SECTIONS)[number]) => <p>{section.body}</p>}
            </TabsContent>
          </Tabs>

          <Accordion items={FAQS}>
            {(faq: (typeof FAQS)[number]) => (
              <AccordionItem>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          <Collapsible>
            <CollapsibleTrigger>Show details</CollapsibleTrigger>
            <CollapsibleContent>Hidden until asked for.</CollapsibleContent>
          </Collapsible>
        </div>
      </Section>

      <Section title="Navigation">
        <div class={stack} style={{ "max-width": "40rem" }}>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Invoices</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

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
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </Section>

      <Section title="Command">
        <div
          class={stack}
          style={{
            "max-width": "28rem",
            border: "1px solid var(--border)",
            "border-radius": "var(--radius)",
            overflow: "hidden",
          }}
        >
          <Command items={PALETTE} placeholder="Type a command or search" aria-label="Commands">
            {(entry: (typeof PALETTE)[number]) => (
              <CommandItem>
                {entry.name}
                <CommandShortcut>{entry.keys}</CommandShortcut>
              </CommandItem>
            )}
          </Command>
        </div>
      </Section>

      <Section title="Combobox">
        <div class={stack}>
          <Combobox
            items={FRUITS}
            placeholder="Select a fruit"
            searchPlaceholder="Search fruit"
            aria-label="Fruit"
            label={(entry: (typeof FRUITS)[number]) => entry.name}
          />
        </div>
      </Section>

      <Section title="ToggleGroup, HoverCard and Menubar">
        <div class={row}>
          <ToggleGroup type="multiple" variant="outline" aria-label="Format">
            <ToggleGroupItem value="bold" aria-label="Bold">
              <Bold />
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Italic">
              I
            </ToggleGroupItem>
            <ToggleGroupItem value="underline" aria-label="Underline">
              U
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup spacing={2} aria-label="Align">
            <ToggleGroupItem value="left" aria-label="Left">
              L
            </ToggleGroupItem>
            <ToggleGroupItem value="centre" aria-label="Centre">
              C
            </ToggleGroupItem>
          </ToggleGroup>

          <HoverCard openDelay={200} closeDelay={200}>
            <HoverCardTrigger>
              <Button variant="link">@barq</Button>
            </HoverCardTrigger>
            <HoverCardContent>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <strong>@barq</strong>
                <span style={{ color: "var(--muted-foreground)", "font-size": "0.875rem" }}>
                  Reactive without a virtual DOM.
                </span>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>

        <div class={row} style={{ "margin-top": "0.75rem" }}>
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent items={ACTIONS} aria-label="File">
                {(action: (typeof ACTIONS)[number]) => <MenubarItem>{action.name}</MenubarItem>}
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Edit</MenubarTrigger>
              <MenubarContent items={ACTIONS} aria-label="Edit">
                {(action: (typeof ACTIONS)[number]) => <MenubarItem>{action.name}</MenubarItem>}
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent items={ACTIONS} aria-label="View">
                {(action: (typeof ACTIONS)[number]) => <MenubarItem>{action.name}</MenubarItem>}
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>
      </Section>

      <Section title="Field">
        <FieldSet style={{ "max-width": "32rem", border: "0", margin: "0", padding: "0" }}>
          <FieldLegend>Delivery</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel for="street">Street</FieldLabel>
              <Input id="street" placeholder="12 Rue de Rivoli" />
              <FieldDescription>Where the parcel goes.</FieldDescription>
            </Field>
            <FieldSeparator>or</FieldSeparator>
            <Field orientation="horizontal">
              <Checkbox id="receipts" />
              <FieldContent>
                <FieldTitle>Send receipts</FieldTitle>
                <FieldDescription>One email per payment.</FieldDescription>
              </FieldContent>
            </Field>
            <Field isInvalid>
              <FieldLabel for="card">Card</FieldLabel>
              <Input id="card" aria-invalid="true" placeholder="4242 4242 4242 4242" />
              <FieldError errors={[{ message: "That card was declined." }]} />
            </Field>
            <Field isDisabled>
              <FieldLabel for="vat">VAT number</FieldLabel>
              <Input id="vat" disabled placeholder="Business accounts only" />
            </Field>
            <Field orientation="responsive">
              <FieldLabel for="window">Delivery window</FieldLabel>
              <Input id="window" placeholder="09:00 to 12:00" />
            </Field>
            <FieldLabel for="express">
              <Field orientation="horizontal">
                <Checkbox id="express" />
                <FieldContent>
                  <FieldTitle>Express</FieldTitle>
                  <FieldDescription>Next working day, 4.50 more.</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          </FieldGroup>
        </FieldSet>
      </Section>

      <Section title="InputGroup">
        <div class={stack} style={{ "max-width": "26rem" }}>
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput aria-label="Search" placeholder="Search invoices" />
          </InputGroup>

          <InputGroup>
            <InputGroupAddon>
              <AtSign />
            </InputGroupAddon>
            <InputGroupInput aria-label="Handle" placeholder="you" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>@example.com</InputGroupText>
            </InputGroupAddon>
          </InputGroup>

          <InputGroup>
            <InputGroupInput aria-label="Token" value="sk-live-2f9a" readOnly />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Copy">
                <Copy />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          <InputGroup>
            <InputGroupInput aria-label="Amount" aria-invalid="true" value="-4" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>EUR</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </Section>

      <Section title="ButtonGroup">
        <div class={row}>
          <ButtonGroup aria-label="Range">
            <Button variant="outline">Day</Button>
            <Button variant="outline">Week</Button>
            <Button variant="outline">Month</Button>
          </ButtonGroup>

          <ButtonGroup aria-label="Copy">
            <ButtonGroupText>https://</ButtonGroupText>
            <Input aria-label="Domain" value="acme.example.com" />
            <Button variant="outline">Go</Button>
          </ButtonGroup>

          <ButtonGroup aria-label="Actions">
            <Button variant="outline">Save</Button>
            <ButtonGroupSeparator />
            <Button variant="outline" size="icon" aria-label="More">
              <Bold />
            </Button>
          </ButtonGroup>
        </div>
        <div class={row} style={{ "margin-top": "0.75rem" }}>
          <ButtonGroup orientation="vertical" aria-label="Vertical">
            <Button variant="outline">Top</Button>
            <Button variant="outline">Middle</Button>
            <Button variant="outline">Bottom</Button>
          </ButtonGroup>
        </div>
      </Section>

      <Section title="Item">
        <ItemGroup style={{ "max-width": "32rem" }}>
          <Item variant="outline">
            <ItemMedia variant="icon">
              <FileText />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Q3 report</ItemTitle>
              <ItemDescription>Uploaded two days ago, 2.4 MB.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" variant="outline">
                Open
              </Button>
            </ItemActions>
          </Item>
          <ItemSeparator />
          <Item size="sm" href="#">
            <ItemMedia variant="icon">
              <FileText />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Q2 report</ItemTitle>
              <ItemDescription>A link, so the whole row lights up.</ItemDescription>
            </ItemContent>
          </Item>
          <ItemSeparator />
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Q1 report</ItemTitle>
              <ItemDescription>Archived.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">Archived</Badge>
            </ItemActions>
          </Item>
        </ItemGroup>
      </Section>

      <Section title="Display">
        <div class={row}>
          <Avatar>
            <AvatarFallback>SA</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>LG</AvatarFallback>
          </Avatar>
          <Spinner />
          <KbdGroup>
            <Kbd>Cmd</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <Separator orientation="vertical" style={{ height: "1.5rem" }} />
          <Skeleton style={{ width: "8rem", height: "1rem" }} />
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>INV001</TableCell>
              <TableCell>
                <Badge variant="secondary">Paid</Badge>
              </TableCell>
              <TableCell>250.00</TableCell>
            </TableRow>
            <TableRow isSelected>
              <TableCell>INV002</TableCell>
              <TableCell>
                <Badge variant="destructive">Overdue</Badge>
              </TableCell>
              <TableCell>150.00</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Empty and ScrollArea">
        <div class={row} style={{ "align-items": "stretch" }}>
          <Empty style={{ "max-width": "22rem" }}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>No invoices yet</EmptyTitle>
              <EmptyDescription>They appear here once you send one.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm">New invoice</Button>
            </EmptyContent>
          </Empty>

          <ScrollArea aria-label="Log" style={{ height: "10rem", width: "18rem" }}>
            <div style={{ padding: "0.75rem", display: "grid", gap: "0.5rem" }}>
              {Array.from({ length: 20 }, (_, index) => (
                <div>Line {String(index + 1)}</div>
              ))}
            </div>
          </ScrollArea>

          <AspectRatio ratio={16 / 9} style={{ width: "18rem", "align-self": "flex-start" }}>
            <div
              style={{
                background: "var(--muted)",
                "border-radius": "var(--radius)",
                display: "grid",
                "place-items": "center",
              }}
            >
              16 / 9
            </div>
          </AspectRatio>
        </div>
      </Section>
    </main>
  );
}

/** shadcn shows a composed screen first and the parts on demand. */
const VIEWS = [
  { id: "showcase", label: "01" },
  { id: "gallery", label: "02" },
];

function Designer() {
  const system = design();
  // Whatever the URL asked for, on the page before anything is drawn.
  system.set({});
  const view = signal("showcase");

  return (
    <div class={designer} data-slot="designer">
      <Toaster />
      <Customizer design={system} />
      <div class={panel} data-slot="preview">
        <div class={scroller}>{view() === "showcase" ? <Showcase /> : <Gallery />}</div>
        <div class={ui("dark", switcher)} data-slot="preview-switcher">
          <For each={() => VIEWS}>
            {(each: (typeof VIEWS)[number]) => (
              <Button
                size="sm"
                variant="ghost"
                data-active={() => (view() === each.id ? "true" : "false")}
                onPress={() => view.set(each.id)}
              >
                {each.label}
              </Button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

render(() => <Designer />, document.getElementById("app")!);
