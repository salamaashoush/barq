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

import { cssRegistration } from "@barqjs/compiler/vite";
import { collectCss } from "@barqjs/css";
const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
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
// Inside the package rather than the system temp directory: the built module
// imports `@barqjs/server`, and resolution walks up from where the file IS.
const workspace = mkdtempSync(
  join(fileURLToPath(new URL("../node_modules/", import.meta.url)), "barq-ui-ssr-"),
);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function server(source: string): Promise<{ page: () => string }> {
  const entry = join(workspace, `probe${probes++}.tsx`);
  writeFileSync(entry, source.replaceAll("<root>", root));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [ssrPlugin],
    external: ["@barqjs/core", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success) throw new AggregateError(result.logs, "the page did not build");

  const file = join(workspace, `built${probes}.mjs`);
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
      expect(sheet, `.${name} is on the button and nowhere in the stylesheet`).toContain(
        `.${name}`,
      );
    }
  });
});
