/**
 * Every component on one page, for looking at in a real browser.
 *
 * Not a test. The suite asserts on the rules a class produced; this is what a
 * person opens to see whether those rules add up to shadcn's look — the one
 * question no headless DOM can answer.
 */

import { render, signal } from "@barqjs/core";
import { css, globalCss } from "@barqjs/css";
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
  ACCENT_THEMES,
  installTheme,
  Kbd,
  KbdGroup,
  Label,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
  NativeSelect,
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
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Select,
  SelectItem,
  Separator,
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
  Tooltip,
  TooltipContent,
} from "@barqjs/ui";
import "@barqjs/ui/theme/reset.ts";
import { AtSign } from "@barqjs/lucide/icons/at-sign";
import { Bold } from "@barqjs/lucide/icons/bold";
import { Copy } from "@barqjs/lucide/icons/copy";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Search } from "@barqjs/lucide/icons/search";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";

installTheme({ base: "neutral" });

globalCss`
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
  }
`;

const page = css`
  max-width: 68rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 6rem;
  display: grid;
  gap: 2.5rem;
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

function Section(props: { title?: string; children?: unknown }) {
  return (
    <section data-section={props.title?.()}>
      <h2 class={heading}>{props.title}</h2>
      {props.children}
    </section>
  );
}

/** The seventeen accents, for switching theme with the page open. */
const ACCENTS = ACCENT_THEMES.map((theme) => ({ id: theme.name, name: theme.title }));

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

const FRUITS = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry" },
];

function Gallery() {
  const dark = signal(false);
  const progress = signal(62);

  return (
    <main class={page} id="gallery">
      <div class={row}>
        <h1 style={{ margin: "0", "font-size": "1.5rem", "font-weight": "600" }}>@barqjs/ui</h1>
        <span style={{ flex: "1" }} />
        <Select
          items={ACCENTS}
          aria-label="Accent"
          placeholder="Accent"
          size="sm"
          onSelectionChange={(key) => {
            installTheme(
              key === null ? { base: "neutral" } : { base: "neutral", accent: String(key) },
            );
          }}
        >
          {(entry: (typeof ACCENTS)[number]) => <SelectItem>{entry.name}</SelectItem>}
        </Select>
        <Switch
          aria-label="Dark mode"
          onChange={(on: boolean) => {
            dark.set(on);
            document.documentElement.classList.toggle("dark", on);
          }}
        />
        <Label>Dark</Label>
      </div>

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

render(() => <Gallery />, document.getElementById("app")!);
