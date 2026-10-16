/**
 * Every component through the STRING backend.
 *
 * This package had never been rendered on a server. Nothing in it reaches for
 * `window` at render time as far as reading goes, but "as far as reading goes"
 * is an argument and this is a test: a component that touches the DOM outside a
 * ref, a `matchMedia` in a component body, a measurement taken while building
 * — each is a crash that only the server sees, and each ships silently because
 * every suite here runs in happy-dom, where all of it works.
 *
 * The fixture is BUNDLED rather than imported. The suite's own loader compiles
 * `.tsx` for the DOM, so importing a component here would measure the DOM
 * backend under a server renderer; `Bun.build` with a plugin of its own
 * compiles this package, `@barqjs/aria` and `@barqjs/lucide` for the string
 * backend, which is what a consumer's build does.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cssRegistration } from "@barqjs/vite/internal";
import { collectCss } from "@barqjs/css";

import { ENTRIES } from "./entries.ts";
import { FIXTURES } from "./ssr-fixtures.ts";
const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; css?: string };
};

/**
 * The same plugin as the suite's, with `ssr` on.
 *
 * `@barqjs/core`, `@barqjs/css` and `@barqjs/server` stay external so the
 * bundle and this file share one runtime: two copies of the scheduler mean the
 * markup is built under a scope this file cannot see.
 */
const ssrPlugin = {
  name: "barq-ssr",
  setup(build: {
    onLoad(
      filter: { filter: RegExp },
      load: (args: { path: string }) => { contents: string; loader: "ts" | "tsx" },
    ): void;
  }) {
    build.onLoad({ filter: /\.tsx?$/ }, (args) => {
      const result = native.transform(readFileSync(args.path, "utf8"), {
        filename: args.path,
        ssr: true,
        strictCss: true,
      });
      // The CSS a module produced has nowhere to go without a bundler, and
      // dropping it is how a suite ends up asserting on an empty stylesheet.
      const contents =
        result.css === undefined || result.css === ""
          ? result.code
          : result.code + cssRegistration(args.path, result.css);
      return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" } as const;
    });
  },
};

const root = fileURLToPath(new URL("./index.ts", import.meta.url));
// `toast` gives its `Toaster` up to `sonner` in the barrel, so the fixture
// reaches it the way an application does: by its own entry point.
const toastEntry = fileURLToPath(new URL("./ui/toast.tsx", import.meta.url));
// Inside the package rather than the system temp directory: the built module
// imports `@barqjs/server`, and resolution walks up from where the file IS.
const workspace = mkdtempSync(
  join(fileURLToPath(new URL("../node_modules/", import.meta.url)), "barq-ui-ssr-"),
);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function server(source: string): Promise<{ page: () => string }> {
  // Named once, before the build is awaited: a probe still building when its
  // test timed out read the counter after the next one bumped it, and the two
  // wrote and imported the same file.
  const id = probes++;
  const entry = join(workspace, `probe${id}.tsx`);
  writeFileSync(entry, source.replaceAll("<root>", root).replaceAll("<toast>", toastEntry));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [ssrPlugin],
    external: ["@barqjs/core", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success) throw new AggregateError(result.logs, "the page did not build");

  const file = join(workspace, `built${id}.mjs`);
  writeFileSync(file, await (result.outputs[0] as { text(): Promise<string> }).text());
  return (await import(file)) as { page: () => string };
}

/**
 * The fixture calls `renderToString` itself, which is the only spelling that
 * gets the root a scope: the compiler rewrites the callback to take one, and
 * calling the component from HERE with `null` leaves every `each` under it
 * parented to nothing.
 */
function html(mod: { page: () => string }): string {
  return mod.page();
}

/**
 * The same page in a process that has no DOM at all.
 *
 * `server()` imports the built module HERE, where happy-dom has already given
 * the process a `document`, so `isServer` is false and anything reaching for
 * `window` finds one. A real server has neither, and the effects a render
 * schedules run after the markup is returned, which is why the child waits
 * before it reports.
 */
async function serverProcess(
  source: string,
): Promise<{ code: number; html: string; errors: string }> {
  const id = probes++;
  const entry = join(workspace, `process${id}.tsx`);
  writeFileSync(entry, source.replaceAll("<root>", root).replaceAll("<toast>", toastEntry));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [ssrPlugin],
    external: ["@barqjs/core", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success) throw new AggregateError(result.logs, "the page did not build");

  const built = join(workspace, `process-built${id}.mjs`);
  writeFileSync(built, await (result.outputs[0] as { text(): Promise<string> }).text());
  const runner = join(workspace, `process-run${id}.mjs`);
  writeFileSync(
    runner,
    [
      `import { page } from ${JSON.stringify(built)};`,
      "const html = page();",
      "await new Promise((resolve) => setTimeout(resolve, 30));",
      "process.stdout.write(html);",
      "",
    ].join("\n"),
  );

  const child = Bun.spawn(["bun", runner], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, html: out, errors };
}

describe("the server", () => {
  test("the whole set renders to markup, with its slots", async () => {
    const mod = await server(`
      import { renderToString } from "@barqjs/server";
      import {
        Accordion, AccordionContent, AccordionItem, AccordionTrigger,
        Alert, AlertTitle, Avatar, AvatarFallback, Badge, Breadcrumb, BreadcrumbItem,
        BreadcrumbLink, BreadcrumbList, Button, Card, CardContent, CardHeader, CardTitle,
        Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, Empty, Field,
        FieldLabel, Input, InputGroup, Item, Kbd, Label, NativeSelect, Pagination,
        PaginationContent, PaginationItem, PaginationLink, Progress, RadioGroup, RadioGroupItem,
        ScrollArea, Separator, Skeleton, Slider, Spinner, Switch, Table, TableBody,
        TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList,
        TabsTrigger, Textarea, Toggle, ToggleGroup, ToggleGroupItem,
      } from "<root>";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <main>
            <Button>Save</Button>
            <Badge>New</Badge>
            <Alert><AlertTitle>Careful</AlertTitle></Alert>
            <Avatar><AvatarFallback>SA</AvatarFallback></Avatar>
            <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem></BreadcrumbList></Breadcrumb>
            <Card><CardHeader><CardTitle>Invoices</CardTitle></CardHeader><CardContent>Twelve</CardContent></Card>
            <Checkbox>Accept</Checkbox>
            <Collapsible><CollapsibleTrigger>More</CollapsibleTrigger><CollapsibleContent>Body</CollapsibleContent></Collapsible>
            <Accordion items={[{ id: "one", q: "Is it accessible?", a: "Yes" }]}>
              {(faq) => (
                <AccordionItem>
                  <AccordionTrigger>{faq.q}</AccordionTrigger>
                  <AccordionContent>{faq.a}</AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
            <Empty>Nothing here</Empty>
            <Field><FieldLabel>Email</FieldLabel><Input placeholder="you@example.com" /></Field>
            <InputGroup><Input /></InputGroup>
            <Item>A row</Item>
            <Kbd>K</Kbd>
            <Label>Name</Label>
            <NativeSelect><option>One</option></NativeSelect>
            <Pagination><PaginationContent><PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem></PaginationContent></Pagination>
            <Progress value={40} aria-label="Storage" />
            <RadioGroup aria-label="Size"><RadioGroupItem value="s">Small</RadioGroupItem></RadioGroup>
            <ScrollArea>Long</ScrollArea>
            <Separator />
            <Skeleton />
            <Slider aria-label="Volume" defaultValue={30} />
            <Spinner />
            <Switch>Wi-Fi</Switch>
            <Table><TableHeader><TableRow><TableHead>Invoice</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>INV-001</TableCell></TableRow></TableBody></Table>
            <Tabs items={[{ id: "a", name: "Overview", body: "Body" }]} defaultSelectedKey="a">
              <TabsList aria-label="Sections">{(section) => <TabsTrigger>{section.name}</TabsTrigger>}</TabsList>
              <TabsContent>{(section) => <p>{section.body}</p>}</TabsContent>
            </Tabs>
            <Textarea />
            <Toggle>B</Toggle>
            <ToggleGroup aria-label="Style"><ToggleGroupItem value="bold">B</ToggleGroupItem></ToggleGroup>
          </main>
        );
      }
    `);

    const markup = html(mod);

    for (const slot of [
      "button",
      "badge",
      "alert",
      "avatar",
      "breadcrumb",
      "card",
      "checkbox",
      "collapsible",
      "accordion",
      "empty",
      "field",
      "input-group",
      "item",
      "kbd",
      "label",
      "native-select",
      "pagination",
      "progress",
      "radio-group",
      "scroll-area",
      "separator",
      "skeleton",
      "slider",
      "spinner",
      "switch",
      "table",
      "tabs",
      "textarea",
      "toggle",
      "toggle-group",
    ]) {
      expect(markup, `${slot} is not in the server markup`).toContain(`data-slot="${slot}"`);
    }
  });

  test("the roles and the state are in the markup rather than added on the client", async () => {
    // A page whose first paint has no roles is a page a screen reader reads as
    // a pile of divs until the JavaScript lands.
    const mod = await server(`
      import { renderToString } from "@barqjs/server";
      import { Checkbox, Progress, Slider, Switch, Tabs, TabsList, TabsTrigger, TabsContent } from "<root>";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <div>
            <Checkbox defaultSelected>Accept</Checkbox>
            <Switch>Wi-Fi</Switch>
            <Progress value={40} aria-label="Storage" />
            <Slider aria-label="Volume" defaultValue={30} />
            <Tabs items={[{ id: "a", name: "Overview", body: "Body" }]} defaultSelectedKey="a">
              <TabsList aria-label="Sections">{(section) => <TabsTrigger>{section.name}</TabsTrigger>}</TabsList>
              <TabsContent>{(section) => <p>{section.body}</p>}</TabsContent>
            </Tabs>
          </div>
        );
      }
    `);

    const markup = html(mod);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="40"');
    // The thumb is an `<input type="range">`, which already IS a slider; a
    // `role` on top would be the second one.
    expect(markup).toContain('type="range"');
    expect(markup).toContain('aria-valuetext="30"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('role="switch"');
    // A native `<input type="checkbox">`, so the state is the `checked`
    // attribute rather than `aria-checked`: the second would be a claim the
    // element already makes.
    expect(markup).toContain("checked=");
    expect(markup).toContain('data-selected=""');
  });

  test("an overlay that is closed renders nothing, and does not reach for a DOM", async () => {
    // Every one of these builds a portal on the client. On the server there is
    // nothing to portal INTO, so the answer has to be no markup rather than a
    // crash.
    const mod = await server(`
      import { renderToString } from "@barqjs/server";
      import {
        AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogTrigger,
        Dialog, DialogContent, DialogTitle, DialogTrigger,
        Drawer, DrawerContent, DrawerTitle, DrawerTrigger,
        DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
        HoverCard, HoverCardContent, HoverCardTrigger,
        Popover, PopoverContent, PopoverTrigger,
        Sheet, SheetContent, SheetTitle, SheetTrigger,
        Tooltip, TooltipContent,
        Button,
      } from "<root>";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <div>
            <Dialog><DialogTrigger><Button>Open</Button></DialogTrigger><DialogContent><DialogTitle>T</DialogTitle></DialogContent></Dialog>
            <AlertDialog><AlertDialogTrigger><Button>Delete</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>T</AlertDialogTitle></AlertDialogContent></AlertDialog>
            <Sheet><SheetTrigger><Button>Filters</Button></SheetTrigger><SheetContent><SheetTitle>T</SheetTitle></SheetContent></Sheet>
            <Drawer><DrawerTrigger><Button>Goal</Button></DrawerTrigger><DrawerContent><DrawerTitle>T</DrawerTitle></DrawerContent></Drawer>
            <Popover><PopoverTrigger><Button>Size</Button></PopoverTrigger><PopoverContent>Body</PopoverContent></Popover>
            <HoverCard><HoverCardTrigger><Button>@barq</Button></HoverCardTrigger><HoverCardContent>Body</HoverCardContent></HoverCard>
            <Tooltip><Button>Help</Button><TooltipContent>Body</TooltipContent></Tooltip>
            <DropdownMenu><DropdownMenuTrigger><Button>Menu</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>One</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>
        );
      }
    `);

    const markup = html(mod);
    // The triggers are there, so the page is usable the moment it paints.
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("Filters");
    // And nothing that only exists once something opens.
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain('data-slot="dialog-content"');
    expect(markup).not.toContain('data-slot="drawer-content"');
    expect(markup).not.toContain('data-slot="popover-content"');
  });

  test("an overlay that is OPEN on the server touches no DOM and takes nothing down", async () => {
    // Open from the first render, and opened from `onSettled`, which runs on
    // the server too: a welcome popover is written exactly that way. There is
    // no `document` to portal into, listen on or measure, so the answer is the
    // trigger and no overlay, from a process that exits cleanly.
    const result = await serverProcess(`
      import { createSignal, onSettled } from "@barqjs/core";
      import { renderToString } from "@barqjs/server";
      import {
        AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogTrigger,
        Button,
        Dialog, DialogContent, DialogTitle, DialogTrigger,
        HoverCard, HoverCardContent, HoverCardTrigger,
        Popover, PopoverContent, PopoverTrigger,
        Sheet, SheetContent, SheetTitle, SheetTrigger,
        Tooltip, TooltipContent,
      } from "<root>";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Welcome() {
        const [open, setOpen] = createSignal(false);
        onSettled(() => {
          setOpen(true);
        });
        return (
          <Popover isOpen={open()} onOpenChange={setOpen}>
            <PopoverTrigger><Button>Welcome</Button></PopoverTrigger>
            <PopoverContent>Body</PopoverContent>
          </Popover>
        );
      }

      function Page() {
        return (
          <div>
            <Welcome />
            <Popover isOpen><PopoverTrigger><Button>Size</Button></PopoverTrigger><PopoverContent isModal>Body</PopoverContent></Popover>
            <Dialog isOpen><DialogTrigger><Button>Open</Button></DialogTrigger><DialogContent><DialogTitle>T</DialogTitle></DialogContent></Dialog>
            <AlertDialog isOpen><AlertDialogTrigger><Button>Delete</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>T</AlertDialogTitle></AlertDialogContent></AlertDialog>
            <Sheet isOpen><SheetTrigger><Button>Filters</Button></SheetTrigger><SheetContent><SheetTitle>T</SheetTitle></SheetContent></Sheet>
            <HoverCard isOpen><HoverCardTrigger><Button>@salama</Button></HoverCardTrigger><HoverCardContent>Body</HoverCardContent></HoverCard>
            <Tooltip isOpen><Button>Help</Button><TooltipContent>Body</TooltipContent></Tooltip>
          </div>
        );
      }
    `);

    expect(result.errors).toBe("");
    expect(result.code).toBe(0);
    expect(result.html).toContain("Welcome");
    expect(result.html).toContain("Filters");
    expect(result.html).toContain('aria-expanded="true"');
  });

  test("the composed ones render too, including the ones that measure on the client", async () => {
    const mod = await server(`
      import { renderToString } from "@barqjs/server";
      import {
        Calendar, ChartBars, ChartContainer, DatePicker, InputOTP, InputOTPGroup, InputOTPSlot,
        NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList,
        ResizableHandle, ResizablePanel, ResizablePanelGroup,
        Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
        Sidebar, SidebarContent, SidebarProvider, Toaster,
      } from "<root>";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <div>
            <Calendar aria-label="Departure" />
            <DatePicker aria-label="Pick a date" />
            <InputOTP maxLength={4}><InputOTPGroup><InputOTPSlot index={0} /></InputOTPGroup></InputOTP>
            <NavigationMenu><NavigationMenuList><NavigationMenuItem value="home"><NavigationMenuLink href="/">Home</NavigationMenuLink></NavigationMenuItem></NavigationMenuList></NavigationMenu>
            <ResizablePanelGroup><ResizablePanel>a</ResizablePanel><ResizableHandle /><ResizablePanel>b</ResizablePanel></ResizablePanelGroup>
            <Carousel><CarouselContent><CarouselItem>One</CarouselItem></CarouselContent><CarouselPrevious /><CarouselNext /></Carousel>
            <SidebarProvider><Sidebar><SidebarContent>Inbox</SidebarContent></Sidebar></SidebarProvider>
            <Toaster />
            <ChartContainer config={[{ key: "visitors", label: "Visitors", color: "var(--chart-1)" }]}>
              <ChartBars
                data={[{ month: "Jan", visitors: 10 }, { month: "Feb", visitors: 20 }]}
                x="month"
                aria-label="Visitors by month"
              />
            </ChartContainer>
          </div>
        );
      }
    `);

    const markup = html(mod);
    for (const slot of [
      "calendar",
      "date-picker-trigger",
      "input-otp",
      "navigation-menu",
      "resizable-panel-group",
      "carousel",
      "sidebar",
      "toaster",
      "chart",
    ]) {
      expect(markup, `${slot} is not in the server markup`).toContain(`data-slot="${slot}"`);
    }
  });

  test("the parts added beside the first set render on the server too", async () => {
    const source = `
      import { renderToString } from "@barqjs/server";
      import {
        Calendar, DateRangePicker, DirectionProvider,
        Questionnaire, QuestionnaireActions, QuestionnaireChoice, QuestionnaireChoices,
        QuestionnaireItem, QuestionnaireNext, QuestionnaireProgress, QuestionnaireTitle,
        ResizableHandle, ResizablePanel, ResizablePanelGroup,
        ScrollArea, ScrollBar, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
        ToggleGroup, ToggleGroupItem, useIsMobile,
      } from "<root>";
      import { Toaster } from "<toast>";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        const isMobile = useIsMobile();
        return (
          <DirectionProvider dir="rtl">
            <div data-mobile={String(isMobile())}>
              <Calendar aria-label="Departure" mode="multiple" numberOfMonths={2} captionLayout="dropdown" showWeekNumber />
              <DateRangePicker aria-label="Stay" />
              <Questionnaire aria-label="Plan">
                <QuestionnaireProgress />
                <QuestionnaireItem name="plan">
                  <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
                  <QuestionnaireChoices>
                    <QuestionnaireChoice value="plus"><span>Plus</span></QuestionnaireChoice>
                  </QuestionnaireChoices>
                </QuestionnaireItem>
                <QuestionnaireActions><QuestionnaireNext /></QuestionnaireActions>
              </Questionnaire>
              <ResizablePanelGroup orientation="vertical" autoSaveId="layout">
                <ResizablePanel collapsible defaultSize={30}>a</ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel>b</ResizablePanel>
              </ResizablePanelGroup>
              <ScrollArea aria-label="Log"><div>Line 1</div><ScrollBar orientation="horizontal" /></ScrollArea>
              <Tabs defaultValue="account">
                <TabsList aria-label="Settings">
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="password">Password</TabsTrigger>
                </TabsList>
                <TabsContent value="account">Account settings</TabsContent>
                <TabsContent value="password">Password settings</TabsContent>
              </Tabs>
              <Textarea aria-label="Notes" />
              <ToggleGroup type="single" aria-label="Alignment">
                <ToggleGroupItem value="start">Start</ToggleGroupItem>
                <ToggleGroupItem value="end">End</ToggleGroupItem>
              </ToggleGroup>
              <Toaster />
            </div>
          </DirectionProvider>
        );
      }
    `;

    const bare = await serverProcess(source);
    expect(bare.errors).toBe("");
    expect(bare.code).toBe(0);

    const markup = html(await server(source));
    expect(bare.html).toContain('data-slot="questionnaire"');
    for (const slot of [
      "calendar",
      "date-range-picker-trigger",
      "questionnaire",
      "questionnaire-choice",
      "resizable-panel-group",
      "resizable-handle",
      "scroll-area-scrollbar",
      "tabs-trigger",
      "tabs-content",
      "textarea",
      "toggle-group-item",
    ]) {
      expect(markup, `${slot} is not in the server markup`).toContain(`data-slot="${slot}"`);
    }
    expect(markup).toContain('data-mobile="false"');
    expect(markup).toContain('data-orientation="vertical"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('role="separator"');
    // The viewport lives in a portal, which a server has nowhere to put: the
    // toaster has to render without one rather than reach for `document.body`.
    expect(markup).not.toContain('data-slot="toast-viewport"');
  });

  test("a toaster with toasts already raised renders in a process with no DOM", async () => {
    // An empty toaster is one element. With a toast up it builds a row, and a
    // row is where the swipe, the timers and the measuring are set up: the
    // part that reaches for a document if anything does.
    const source = `
      import { renderToString } from "@barqjs/server";
      import { Toaster as Sonner, toast as sonner } from "<root>";
      import { Toaster, toast } from "<toast>";

      export function page() {
        sonner.success("Saved", {
          description: "Three files",
          action: { label: "Undo", onClick: () => {} },
        });
        sonner.loading("Uploading");
        toast.add({ title: "Event created", description: "Sunday at 9:00", type: "success" });
        return renderToString(() => (
          <div>
            <Sonner richColors position="top-center" />
            <Toaster />
          </div>
        ));
      }
    `;

    const bare = await serverProcess(source);
    expect(bare.errors).toBe("");
    expect(bare.code).toBe(0);
    expect(bare.html).toContain('data-slot="toaster"');
  });

  test("the classes in the markup are classes the stylesheet defines", async () => {
    // Server markup with no stylesheet behind it is an unstyled first paint,
    // which is the whole reason to render on a server at all.
    const mod = await server(`
      import { renderToString } from "@barqjs/server";
      import { Button } from "<root>";
      export function page() {
        return renderToString(() => <Page />);
      }
      function Page() { return <Button>Save</Button>; }
    `);

    const markup = html(mod);
    const classes = /class="([^"]+)"/.exec(markup)?.[1]?.split(" ") ?? [];
    expect(classes.length).toBeGreaterThan(5);

    const sheet = collectCss();
    for (const name of classes) {
      // A MARKER has no rule and is not meant to: upstream's styles compile to
      // `.group\/button:has(…)`, so the string has to be on the element for
      // their selector to match and nothing here ever declares it. Every class
      // this package generates starts with `a-`.
      if (!name.startsWith("a-")) continue;
      expect(sheet, `.${name} is on the button and nowhere in the stylesheet`).toContain(
        `.${name}`,
      );
    }
    expect(classes.filter((name) => !name.startsWith("a-"))).toEqual(["group/button"]);
  });

  test("a command palette written as children renders its whole list, roles and all", async () => {
    // Its items register themselves as they render and are scored against the
    // search, both of which lean on effects and refs a server never runs: the
    // markup has to be the full, unfiltered list regardless.
    const command = fileURLToPath(new URL("./ui/command.tsx", import.meta.url));
    const mod = await server(`
      import { renderToString } from "@barqjs/server";
      import {
        Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
        CommandSeparator, CommandShortcut,
      } from "${command}";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <Command label="Commands">
            <CommandInput placeholder="Type a command" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Settings">
                <CommandItem>Profile<CommandShortcut>P</CommandShortcut></CommandItem>
                <CommandItem disabled>Billing</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandItem value="sign-out">Sign out</CommandItem>
            </CommandList>
          </Command>
        );
      }
    `);

    const markup = html(mod);
    for (const slot of [
      "command",
      "command-input-wrapper",
      "command-input",
      "command-list",
      "command-group",
      "command-item",
      "command-separator",
      "command-shortcut",
    ]) {
      expect(markup, `${slot} is not in the server markup`).toContain(`data-slot="${slot}"`);
    }
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('role="listbox"');
    expect(markup.match(/role="option"/g)).toHaveLength(3);
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('data-slot="command-empty"');
    expect(markup).not.toMatch(/ hidden[=\s>]/);
  });

  test("a select written as parts renders its trigger and none of its list, with no DOM", async () => {
    // While closed it builds its options into an element that is never put in
    // the document, so they register for the trigger's text. A server has no
    // document to make that element from, and must not go looking for one.
    const select = fileURLToPath(new URL("./ui/select.tsx", import.meta.url));
    const result = await serverProcess(`
      import { renderToString } from "@barqjs/server";
      import {
        Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
      } from "${select}";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <Select defaultValue="apple" name="fruit">
            <SelectTrigger aria-label="Fruit"><SelectValue placeholder="Pick one" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Fruits</SelectLabel>
                <SelectItem value="apple">Apple</SelectItem>
                <SelectItem value="banana">Banana</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        );
      }
    `);

    expect(result.errors).toBe("");
    expect(result.code).toBe(0);
    expect(result.html).toContain('data-slot="select-trigger"');
    expect(result.html).toContain('role="combobox"');
    expect(result.html).toContain('aria-haspopup="listbox"');
    expect(result.html).toContain('aria-expanded="false"');
    expect(result.html).toContain('data-slot="select-value"');
    expect(result.html).not.toContain('data-slot="select-content"');
    expect(result.html).not.toContain('role="option"');
  });

  test("a combobox written as parts renders its field and its chips, and no list, with no DOM", async () => {
    // The list is portalled and exists only while open, and the chips find
    // their values by where they rendered. Neither may reach for a document.
    const combobox = fileURLToPath(new URL("./ui/combobox.tsx", import.meta.url));
    const result = await serverProcess(`
      import { For } from "@barqjs/core";
      import { renderToString } from "@barqjs/server";
      import {
        Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent,
        ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxValue,
      } from "${combobox}";

      const NAMES = ["Remix", "Astro"];

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <>
            <Combobox items={NAMES} defaultValue="Astro" name="framework">
              <ComboboxInput aria-label="Framework" showClear />
              <ComboboxContent>
                <ComboboxEmpty>No items found.</ComboboxEmpty>
                <ComboboxList>{(item) => <ComboboxItem value={item}>{item}</ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Combobox multiple items={NAMES} defaultValue={["Remix"]}>
              <ComboboxChips>
                <ComboboxValue>
                  {(values) => (
                    <>
                      <For each={values}>{(value) => <ComboboxChip>{value}</ComboboxChip>}</For>
                      <ComboboxChipsInput aria-label="Frameworks" />
                    </>
                  )}
                </ComboboxValue>
              </ComboboxChips>
            </Combobox>
          </>
        );
      }
    `);

    expect(result.errors).toBe("");
    expect(result.code).toBe(0);
    for (const slot of [
      "input-group",
      "input-group-control",
      "combobox-trigger",
      "combobox-clear",
      "combobox-chips",
      "combobox-chip",
      "combobox-chip-remove",
      "combobox-chip-input",
    ]) {
      expect(result.html, `${slot} is not in the server markup`).toContain(`data-slot="${slot}"`);
    }
    expect(result.html.match(/role="combobox"/g)).toHaveLength(2);
    expect(result.html).toContain('aria-expanded="false"');
    expect(result.html).toContain('aria-autocomplete="list"');
    expect(result.html).toContain('value="Astro"');
    expect(result.html).toContain('name="framework"');
    expect(result.html).not.toContain('data-slot="combobox-content"');
    expect(result.html).not.toContain('role="option"');
  });

  test("a menubar written as parts renders its bar and triggers, and no menu, with no DOM", async () => {
    // The bar orders its triggers by where they are in the document and puts
    // focus back on one in a frame. A server has neither, and a closed bar
    // must ask for neither.
    const menubar = fileURLToPath(new URL("./ui/menubar.tsx", import.meta.url));
    const result = await serverProcess(`
      import { renderToString } from "@barqjs/server";
      import {
        Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarMenu, MenubarRadioGroup,
        MenubarRadioItem, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger,
      } from "${menubar}";

      export function page() {
        return renderToString(() => <Page />);
      }

      function Page() {
        return (
          <Menubar aria-label="Application">
            <MenubarMenu>
              <MenubarTrigger role="menuitem">File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>New tab</MenubarItem>
                <MenubarSub>
                  <MenubarSubTrigger>Share</MenubarSubTrigger>
                  <MenubarSubContent><MenubarItem>Email link</MenubarItem></MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger role="menuitem">View</MenubarTrigger>
              <MenubarContent>
                <MenubarCheckboxItem checked>Full URLs</MenubarCheckboxItem>
                <MenubarRadioGroup value="salama">
                  <MenubarRadioItem value="salama">Salama</MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        );
      }
    `);

    expect(result.errors).toBe("");
    expect(result.code).toBe(0);
    expect(result.html).toContain('role="menubar"');
    expect(result.html).toContain('data-slot="menubar"');
    expect(result.html).toContain('data-slot="menubar-trigger"');
    expect(result.html).toContain('role="menuitem"');
    expect(result.html).toContain('aria-expanded="false"');
    expect(result.html).toContain('data-state="closed"');
    // One Tab stop, in the markup: the first trigger and no other.
    expect(result.html.match(/tabindex="0"/gi)).toHaveLength(1);
    expect(result.html).not.toContain('data-slot="menubar-content"');
    expect(result.html).not.toContain('role="menu"');
  });
});

/** What a module draws: an exported function with a capital. */
async function componentsOf(entry: string): Promise<string[]> {
  const mod = (await import(`./${entry}`)) as Record<string, unknown>;
  return Object.keys(mod)
    .filter((name) => /^[A-Z]/.test(name) && typeof mod[name] === "function")
    .toSorted();
}

const sources = fileURLToPath(new URL("./", import.meta.url));
// The barrel re-exports the rest, so its components are theirs. The themes draw
// nothing, and importing one here would register its rules for every suite
// that runs after this one: the reset's test asks that nothing has.
const MODULES = await Promise.all(
  ENTRIES.filter((entry) => entry !== "index.ts" && !entry.startsWith("theme/")).map(
    async (entry) => [entry, await componentsOf(entry)] as const,
  ),
);
const DRAWN = MODULES.filter(([, components]) => components.length > 0);

interface Rendered {
  code: number;
  errors: string;
  pages: Record<string, { html?: string; error?: string }>;
}

/**
 * Every page in ONE process, each under its own `try`, so a module that
 * cannot render says so by name and the rest still report.
 */
async function renderEveryPage(): Promise<Rendered> {
  const pages: string[] = [];
  const lines = [`import { resetErrorHalt } from "@barqjs/core";`];
  for (const entry of ENTRIES) lines.push(`import ${JSON.stringify(join(sources, entry))};`);

  for (const [entry, components] of DRAWN) {
    const fixture = FIXTURES[entry];
    if (fixture === undefined) continue;
    const file = join(workspace, `page${String(pages.length)}.tsx`);
    writeFileSync(
      file,
      [
        `import { renderToString } from "@barqjs/server";`,
        `import { ${components.join(", ")} } from ${JSON.stringify(join(sources, entry))};`,
        fixture.imports ?? "",
        fixture.declare ?? "",
        "export function render() {",
        fixture.before ?? "",
        `  return renderToString(() => (<div>${fixture.jsx}</div>));`,
        "}",
        "",
      ]
        .join("\n")
        .replaceAll("<ui>", join(sources, "ui")),
    );
    lines.push(`import { render as page${String(pages.length)} } from ${JSON.stringify(file)};`);
    pages.push(`  ${JSON.stringify(entry)}: page${String(pages.length)},`);
  }

  const result = await serverProcess(
    [
      ...lines,
      `const PAGES: Record<string, () => string> = {`,
      ...pages,
      "};",
      "export function page() {",
      "  const out: Record<string, { html?: string; error?: string }> = {};",
      "  for (const name of Object.keys(PAGES)) {",
      "    try {",
      "      out[name] = { html: PAGES[name]!() };",
      "    } catch (error) {",
      "      resetErrorHalt();",
      "      out[name] = { error: error instanceof Error ? (error.stack ?? error.message) : String(error) };",
      "    }",
      "  }",
      "  return JSON.stringify(out);",
      "}",
      "",
    ].join("\n"),
  );
  return {
    code: result.code,
    errors: result.errors,
    pages: result.html === "" ? {} : (JSON.parse(result.html) as Rendered["pages"]),
  };
}

describe("every exported component, in a process with no DOM", () => {
  let rendering: Promise<Rendered> | undefined;
  const rendered = (): Promise<Rendered> => (rendering ??= renderEveryPage());

  test("every module that draws something has a page, and no page is left over", () => {
    expect(DRAWN.map(([entry]) => entry).filter((entry) => FIXTURES[entry] === undefined)).toEqual(
      [],
    );
    const drawn = new Set(DRAWN.map(([entry]) => entry));
    expect(Object.keys(FIXTURES).filter((entry) => !drawn.has(entry))).toEqual([]);
  });

  test("every module loads, and nothing a render scheduled reaches for a DOM afterwards", async () => {
    const result = await rendered();
    expect(result.errors).toBe("");
    expect(result.code).toBe(0);
  });

  test.each(DRAWN)("%s", async (entry, components) => {
    const fixture = FIXTURES[entry];
    const written = `${fixture?.declare ?? ""}${fixture?.jsx ?? ""}`;
    expect(
      components.filter((name) => !new RegExp(`<${name}[\\s/>]`).test(written)),
      `${entry} exports components its page does not render`,
    ).toEqual([]);

    const page = (await rendered()).pages[entry];
    expect(page?.error).toBeUndefined();
    expect(page?.html).toStartWith("<div>");
  });
});
