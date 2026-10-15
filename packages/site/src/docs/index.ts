/**
 * Every component's page, in the order the rail lists them.
 *
 * ALPHABETICAL, which is upstream's order and the only one that scales: a rail
 * of sixty grouped by what the author thinks they are for is a rail you search
 * rather than read.
 *
 * The `description` on each is upstream's own frontmatter, verbatim, because it
 * is the sentence their docs open with and a paraphrase would be a second
 * opinion about what the component is.
 */

import { demos as accordionDemos } from "./examples/accordion/index.ts";
import { demos as alertDemos } from "./examples/alert/index.ts";
import { demos as alertDialogDemos } from "./examples/alert-dialog/index.ts";
import { demos as aspectRatioDemos } from "./examples/aspect-ratio/index.ts";
import { demos as attachmentDemos } from "./examples/attachment/index.ts";
import { demos as avatarDemos } from "./examples/avatar/index.ts";
import { demos as badgeDemos } from "./examples/badge/index.ts";
import { demos as breadcrumbDemos } from "./examples/breadcrumb/index.ts";
import { demos as bubbleDemos } from "./examples/bubble/index.ts";
import { demos as buttonDemos } from "./examples/button/index.ts";
import { demos as buttonGroupDemos } from "./examples/button-group/index.ts";
import { demos as calendarDemos } from "./examples/calendar/index.ts";
import { demos as checkboxDemos } from "./examples/checkbox/index.ts";
import { doc as dataTableDoc } from "./examples/data-table/index.ts";
import { demos as dialogDemos } from "./examples/dialog/index.ts";
import { demos as dropdownMenuDemos } from "./examples/dropdown-menu/index.ts";
import { demos as emptyDemos } from "./examples/empty/index.ts";
import { demos as fieldDemos } from "./examples/field/index.ts";
import { demos as inputDemos } from "./examples/input/index.ts";
import { demos as itemDemos } from "./examples/item/index.ts";
import { demos as labelDemos } from "./examples/label/index.ts";
import { demos as markerDemos } from "./examples/marker/index.ts";
import { demos as radioGroupDemos } from "./examples/radio-group/index.ts";
import { demos as scrollAreaDemos } from "./examples/scroll-area/index.ts";
import { doc as scrollFadeDoc } from "./examples/scroll-fade/index.ts";
import { demos as selectDemos } from "./examples/select/index.ts";
import { demos as separatorDemos } from "./examples/separator/index.ts";
import { doc as shimmerDoc } from "./examples/shimmer/index.ts";
import { demos as skeletonDemos } from "./examples/skeleton/index.ts";
import { demos as sliderDemos } from "./examples/slider/index.ts";
import { demos as switchDemos } from "./examples/switch/index.ts";
import { demos as tableDemos } from "./examples/table/index.ts";
import { demos as tabsDemos } from "./examples/tabs/index.ts";
import { demos as textareaDemos } from "./examples/textarea/index.ts";
import { demos as toggleDemos } from "./examples/toggle/index.ts";
import { demos as cardDemos } from "./examples/card/index.ts";
import { doc as directionDoc } from "./examples/direction/index.ts";
import { doc as toastDoc } from "./examples/toast/index.ts";
import { doc as typographyDoc } from "./examples/typography/index.ts";
import { doc as questionnaireDoc } from "./examples/questionnaire/index.ts";
import { demos as collapsibleDemos } from "./examples/collapsible/index.ts";
import { demos as kbdDemos } from "./examples/kbd/index.ts";
import { demos as paginationDemos } from "./examples/pagination/index.ts";
import { demos as progressDemos } from "./examples/progress/index.ts";
import { demos as spinnerDemos } from "./examples/spinner/index.ts";
import { demos as inputGroupDemos } from "./examples/input-group/index.ts";
import { demos as comboboxDemos } from "./examples/combobox/index.ts";
import { demos as contextMenuDemos } from "./examples/context-menu/index.ts";
import { demos as inputOtpDemos } from "./examples/input-otp/index.ts";
import { demos as carouselDemos } from "./examples/carousel/index.ts";
import { demos as chartDemos } from "./examples/chart/index.ts";
import { demos as commandDemos } from "./examples/command/index.ts";
import { demos as datePickerDemos } from "./examples/date-picker/index.ts";
import { demos as drawerDemos } from "./examples/drawer/index.ts";
import { demos as hoverCardDemos } from "./examples/hover-card/index.ts";
import { demos as tooltipDemos } from "./examples/tooltip/index.ts";
import { demos as popoverDemos } from "./examples/popover/index.ts";
import { demos as sheetDemos } from "./examples/sheet/index.ts";
import { demos as menubarDemos } from "./examples/menubar/index.ts";
import { demos as nativeSelectDemos } from "./examples/native-select/index.ts";
import { demos as toggleGroupDemos } from "./examples/toggle-group/index.ts";
import { demos as resizableDemos } from "./examples/resizable/index.ts";
import { demos as navigationMenuDemos } from "./examples/navigation-menu/index.ts";
import { demos as sonnerDemos } from "./examples/sonner/index.ts";
import { demos as messageDemos } from "./examples/message/index.ts";
import { demos as sidebarDemos } from "./examples/sidebar/index.ts";
import { demos as messageScrollerDemos } from "./examples/message-scroller/index.ts";
import type { ComponentDoc } from "./registry.ts";

const importLine = (names: string, from: string): string =>
  `import { ${names} } from "@barqjs/ui/${from}";`;

export const COMPONENTS: readonly ComponentDoc[] = [
  {
    slug: "accordion",
    title: "Accordion",
    description:
      "A vertically stacked set of interactive headings that each reveal a section of content.",
    usage: [
      importLine("Accordion, AccordionContent, AccordionItem, AccordionTrigger", "accordion"),
      "",
      "<Accordion items={faqs}>",
      "  {(faq) => (",
      "    <AccordionItem>",
      "      <AccordionTrigger>{faq.q}</AccordionTrigger>",
      "      <AccordionContent>{faq.a}</AccordionContent>",
      "    </AccordionItem>",
      "  )}",
      "</Accordion>",
    ].join("\n"),
    demos: accordionDemos,
  },
  {
    slug: "alert",
    title: "Alert",
    description: "Displays a callout for user attention.",
    usage: [
      importLine("Alert, AlertDescription, AlertTitle", "alert"),
      "",
      "<Alert>",
      "  <TriangleAlert />",
      "  <AlertTitle>Heads up</AlertTitle>",
      "  <AlertDescription>Your trial ends in three days.</AlertDescription>",
      "</Alert>",
    ].join("\n"),
    demos: alertDemos,
  },
  {
    slug: "alert-dialog",
    title: "Alert Dialog",
    description:
      "A modal dialog that interrupts the user with important content and expects a response.",
    usage: [
      importLine(
        "AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger",
        "alert-dialog",
      ),
      "",
      "<AlertDialog>",
      "  <AlertDialogTrigger>",
      '    <Button variant="destructive">Delete</Button>',
      "  </AlertDialogTrigger>",
      "  <AlertDialogContent>\u2026</AlertDialogContent>",
      "</AlertDialog>",
    ].join("\n"),
    demos: alertDialogDemos,
  },
  {
    slug: "aspect-ratio",
    title: "Aspect Ratio",
    description: "Displays content within a desired ratio.",
    usage: [
      importLine("AspectRatio", "aspect-ratio"),
      "",
      "<AspectRatio ratio={16 / 9}>",
      '  <img src={src} alt="" />',
      "</AspectRatio>",
    ].join("\n"),
    demos: aspectRatioDemos,
  },
  {
    slug: "attachment",
    title: "Attachment",
    description:
      "Displays a file or image attachment with media, metadata, upload state, and actions.",
    usage: [
      importLine(
        "Attachment, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle",
        "attachment",
      ),
      "",
      "<AttachmentGroup>",
      "  <Attachment>",
      "    <AttachmentMedia><FileText /></AttachmentMedia>",
      "    <AttachmentContent>",
      "      <AttachmentTitle>report.pdf</AttachmentTitle>",
      "      <AttachmentDescription>2.4 MB</AttachmentDescription>",
      "    </AttachmentContent>",
      "  </Attachment>",
      "</AttachmentGroup>",
    ].join("\n"),
    demos: attachmentDemos,
  },
  {
    slug: "avatar",
    title: "Avatar",
    description: "An image element with a fallback for representing the user.",
    usage: [
      importLine("Avatar, AvatarFallback, AvatarImage", "avatar"),
      "",
      "<Avatar>",
      '  <AvatarImage src="/me.png" alt="Salama" />',
      "  <AvatarFallback>SA</AvatarFallback>",
      "</Avatar>",
    ].join("\n"),
    demos: avatarDemos,
  },
  {
    slug: "badge",
    title: "Badge",
    description: "Displays a badge or a component that looks like a badge.",
    usage: [importLine("Badge", "badge"), "", "<Badge>Badge</Badge>"].join("\n"),
    demos: badgeDemos,
  },
  {
    slug: "breadcrumb",
    title: "Breadcrumb",
    description: "Displays the path to the current resource using a hierarchy of links.",
    usage: [
      importLine(
        "Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator",
        "breadcrumb",
      ),
      "",
      "<Breadcrumb>",
      "  <BreadcrumbList>",
      '    <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>',
      "    <BreadcrumbSeparator />",
      "    <BreadcrumbItem><BreadcrumbPage>Invoices</BreadcrumbPage></BreadcrumbItem>",
      "  </BreadcrumbList>",
      "</Breadcrumb>",
    ].join("\n"),
    demos: breadcrumbDemos,
  },
  {
    slug: "bubble",
    title: "Bubble",
    description:
      "Displays conversational content in a message bubble. Supports variants, alignment, grouping, reactions, and collapsible content.",
    usage: [
      importLine("Bubble, BubbleContent", "bubble"),
      "",
      '<Bubble align="end">',
      "  <BubbleContent>Just now, yes.</BubbleContent>",
      "</Bubble>",
    ].join("\n"),
    demos: bubbleDemos,
  },
  {
    slug: "button",
    title: "Button",
    description: "Displays a button or a component that looks like a button.",
    usage: [
      importLine("Button", "button"),
      "",
      '<Button variant="outline" onPress={() => save()}>Save</Button>',
    ].join("\n"),
    demos: buttonDemos,
  },
  {
    slug: "button-group",
    title: "Button Group",
    description: "A container that groups related buttons together with consistent styling.",
    usage: [
      importLine("ButtonGroup, ButtonGroupSeparator, ButtonGroupText", "button-group"),
      "",
      "<ButtonGroup>",
      '  <Button variant="outline">Copy</Button>',
      '  <Button variant="outline">Paste</Button>',
      "</ButtonGroup>",
    ].join("\n"),
    demos: buttonGroupDemos,
  },
  {
    slug: "calendar",
    title: "Calendar",
    description: "A calendar component that allows users to select a date or a range of dates.",
    usage: [
      importLine("Calendar, RangeCalendar", "calendar"),
      "",
      '<Calendar aria-label="Departure" />',
    ].join("\n"),
    demos: calendarDemos,
  },
  {
    slug: "card",
    title: "Card",
    description: "Displays a card with header, content, and footer.",
    usage: [
      importLine(
        "Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle",
        "card",
      ),
      "",
      "<Card>",
      "  <CardHeader>",
      "    <CardTitle>Invoices</CardTitle>",
      "  </CardHeader>",
      "  <CardContent>Twelve invoices.</CardContent>",
      "</Card>",
    ].join("\n"),
    demos: cardDemos,
  },
  {
    slug: "carousel",
    title: "Carousel",
    description: "A carousel with motion and swipe built using Embla.",
    usage: [
      importLine(
        "Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious",
        "carousel",
      ),
      "",
      "<Carousel>",
      "  <CarouselContent>",
      "    <CarouselItem>\u2026</CarouselItem>",
      "  </CarouselContent>",
      "  <CarouselPrevious />",
      "  <CarouselNext />",
      "</Carousel>",
    ].join("\n"),
    demos: carouselDemos,
  },
  {
    slug: "chart",
    title: "Chart",
    description: "Beautiful charts, built on TanStack Charts. Copy and paste into your apps.",
    usage: [
      importLine(
        "ChartBars, ChartContainer, ChartLegend, ChartLines, ChartTooltipContent",
        "chart",
      ),
      "",
      "<ChartContainer config={config}>",
      '  <ChartBars data={data} x="month" aria-label="Revenue by month" />',
      "  <ChartLegend />",
      "</ChartContainer>",
    ].join("\n"),
    demos: chartDemos,
  },
  {
    slug: "checkbox",
    title: "Checkbox",
    description: "A control that allows the user to toggle between checked and not checked.",
    usage: [
      importLine("Checkbox", "checkbox"),
      "",
      '<Checkbox id="terms" />',
      '<Label for="terms">Accept the terms</Label>',
    ].join("\n"),
    demos: checkboxDemos,
  },
  {
    slug: "collapsible",
    title: "Collapsible",
    description: "An interactive component which expands/collapses a panel.",
    usage: [
      importLine("Collapsible, CollapsibleContent, CollapsibleTrigger", "collapsible"),
      "",
      "<Collapsible>",
      "  <CollapsibleTrigger>Show details</CollapsibleTrigger>",
      "  <CollapsibleContent>Hidden until asked for.</CollapsibleContent>",
      "</Collapsible>",
    ].join("\n"),
    demos: collapsibleDemos,
  },
  {
    slug: "combobox",
    title: "Combobox",
    description: "Autocomplete input with a list of suggestions.",
    usage: [
      importLine("Combobox", "combobox"),
      "",
      "<Combobox",
      "  items={fruits}",
      '  placeholder="Select a fruit"',
      '  aria-label="Fruit"',
      "  label={(entry) => entry.name}",
      "/>",
    ].join("\n"),
    demos: comboboxDemos,
  },
  {
    slug: "command",
    title: "Command",
    description: "Command menu for search and quick actions.",
    usage: [
      importLine("Command, CommandItem, CommandShortcut", "command"),
      "",
      '<Command items={palette} placeholder="Type a command or search" aria-label="Commands">',
      "  {(entry) => (",
      "    <CommandItem>",
      "      {entry.name}",
      "      <CommandShortcut>{entry.keys}</CommandShortcut>",
      "    </CommandItem>",
      "  )}",
      "</Command>",
    ].join("\n"),
    demos: commandDemos,
  },
  {
    slug: "context-menu",
    title: "Context Menu",
    description: "Displays a menu of actions triggered by a right click.",
    usage: [
      importLine(
        "ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuTrigger",
        "context-menu",
      ),
      "",
      "<ContextMenu>",
      "  <ContextMenuTrigger>Right-click here</ContextMenuTrigger>",
      '  <ContextMenuContent items={actions} aria-label="Actions">',
      "    {(action) => <ContextMenuItem>{action.name}</ContextMenuItem>}",
      "  </ContextMenuContent>",
      "</ContextMenu>",
    ].join("\n"),
    demos: contextMenuDemos,
  },
  dataTableDoc,
  {
    slug: "date-picker",
    title: "Date Picker",
    description: "A date picker component with range and presets.",
    usage: [
      importLine("DatePicker, DateRangePicker", "date-picker"),
      "",
      "<DatePicker />",
      "<DateRangePicker />",
    ].join("\n"),
    demos: datePickerDemos,
  },
  {
    slug: "dialog",
    title: "Dialog",
    description:
      "A window overlaid on either the primary window or another dialog window, rendering the content underneath inert.",
    usage: [
      importLine(
        "Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger",
        "dialog",
      ),
      "",
      "<Dialog>",
      "  <DialogTrigger>",
      '    <Button variant="outline">Open</Button>',
      "  </DialogTrigger>",
      "  <DialogContent>",
      "    <DialogHeader>",
      "      <DialogTitle>Delete the project?</DialogTitle>",
      "    </DialogHeader>",
      "  </DialogContent>",
      "</Dialog>",
    ].join("\n"),
    demos: dialogDemos,
  },
  directionDoc,
  {
    slug: "drawer",
    title: "Drawer",
    description: "A drawer that slides in from an edge of the screen.",
    usage: [
      importLine(
        "Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger",
        "drawer",
      ),
      "",
      "<Drawer>",
      "  <DrawerTrigger>",
      '    <Button variant="outline">Open</Button>',
      "  </DrawerTrigger>",
      "  <DrawerContent>\u2026</DrawerContent>",
      "</Drawer>",
    ].join("\n"),
    demos: drawerDemos,
  },
  {
    slug: "dropdown-menu",
    title: "Dropdown Menu",
    description:
      "Displays a menu to the user \u2014 such as a set of actions or functions \u2014 triggered by a button.",
    usage: [
      importLine(
        "DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger",
        "dropdown-menu",
      ),
      "",
      "<DropdownMenu>",
      "  <DropdownMenuTrigger>",
      '    <Button variant="outline">Open</Button>',
      "  </DropdownMenuTrigger>",
      '  <DropdownMenuContent items={actions} aria-label="Actions">',
      "    {(action) => <DropdownMenuItem>{action.name}</DropdownMenuItem>}",
      "  </DropdownMenuContent>",
      "</DropdownMenu>",
    ].join("\n"),
    demos: dropdownMenuDemos,
  },
  {
    slug: "empty",
    title: "Empty",
    description: "Use the Empty component to display an empty state.",
    usage: [
      importLine(
        "Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle",
        "empty",
      ),
      "",
      "<Empty>",
      "  <EmptyHeader>",
      '    <EmptyMedia variant="icon"><Inbox /></EmptyMedia>',
      "    <EmptyTitle>No invoices yet</EmptyTitle>",
      "  </EmptyHeader>",
      "</Empty>",
    ].join("\n"),
    demos: emptyDemos,
  },
  {
    slug: "field",
    title: "Field",
    description:
      "Combine labels, controls, and help text to compose accessible form fields and grouped inputs.",
    usage: [
      importLine(
        "Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle",
        "field",
      ),
      "",
      "<Field>",
      '  <FieldLabel for="street">Street</FieldLabel>',
      '  <Input id="street" />',
      "  <FieldDescription>Where the parcel goes.</FieldDescription>",
      "</Field>",
    ].join("\n"),
    demos: fieldDemos,
  },
  {
    slug: "hover-card",
    title: "Hover Card",
    description: "For sighted users to preview content available behind a link.",
    usage: [
      importLine("HoverCard, HoverCardContent, HoverCardTrigger", "hover-card"),
      "",
      "<HoverCard>",
      "  <HoverCardTrigger>",
      '    <Button variant="link">@barq</Button>',
      "  </HoverCardTrigger>",
      "  <HoverCardContent>\u2026</HoverCardContent>",
      "</HoverCard>",
    ].join("\n"),
    demos: hoverCardDemos,
  },
  {
    slug: "input",
    title: "Input",
    description:
      "A text input component for forms and user data entry with built-in styling and accessibility features.",
    usage: [
      importLine("Input", "input"),
      "",
      '<Input type="email" placeholder="you@example.com" />',
    ].join("\n"),
    demos: inputDemos,
  },
  {
    slug: "input-group",
    title: "Input Group",
    description: "Add addons, buttons, and helper content to inputs.",
    usage: [
      importLine(
        "InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText",
        "input-group",
      ),
      "",
      "<InputGroup>",
      "  <InputGroupAddon><Search /></InputGroupAddon>",
      '  <InputGroupInput placeholder="Search invoices" />',
      "</InputGroup>",
    ].join("\n"),
    demos: inputGroupDemos,
  },
  {
    slug: "input-otp",
    title: "Input OTP",
    description: "Accessible one-time password component with copy-paste functionality.",
    usage: [
      importLine("InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot", "input-otp"),
      "",
      "<InputOTP maxLength={6}>",
      "  <InputOTPGroup>",
      "    <InputOTPSlot index={0} />",
      "  </InputOTPGroup>",
      "</InputOTP>",
    ].join("\n"),
    demos: inputOtpDemos,
  },
  {
    slug: "item",
    title: "Item",
    description:
      "A versatile component for displaying content with media, title, description, and actions.",
    usage: [
      importLine(
        "Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle",
        "item",
      ),
      "",
      "<Item>",
      '  <ItemMedia variant="icon"><FileText /></ItemMedia>',
      "  <ItemContent>",
      "    <ItemTitle>Q3 report</ItemTitle>",
      "  </ItemContent>",
      "</Item>",
    ].join("\n"),
    demos: itemDemos,
  },
  {
    slug: "kbd",
    title: "Kbd",
    description: "Used to display textual user input from keyboard.",
    usage: [
      importLine("Kbd, KbdGroup", "kbd"),
      "",
      "<KbdGroup>",
      "  <Kbd>⌘</Kbd>",
      "  <Kbd>K</Kbd>",
      "</KbdGroup>",
    ].join("\n"),
    demos: kbdDemos,
  },
  {
    slug: "label",
    title: "Label",
    description: "Renders an accessible label associated with controls.",
    usage: [
      importLine("Label", "label"),
      "",
      '<Label for="email">Email</Label>',
      '<Input id="email" />',
    ].join("\n"),
    demos: labelDemos,
  },
  {
    slug: "marker",
    title: "Marker",
    description:
      "Displays an inline status, system note, bordered row, or labeled separator in a conversation.",
    usage: [
      importLine("Marker, MarkerContent", "marker"),
      "",
      '<Marker variant="separator">',
      "  <MarkerContent>Yesterday</MarkerContent>",
      "</Marker>",
    ].join("\n"),
    demos: markerDemos,
  },
  {
    slug: "menubar",
    title: "Menubar",
    description:
      "A visually persistent menu common in desktop applications that provides quick access to a consistent set of commands.",
    usage: [
      importLine("Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger", "menubar"),
      "",
      "<Menubar>",
      "  <MenubarMenu>",
      "    <MenubarTrigger>File</MenubarTrigger>",
      '    <MenubarContent items={actions} aria-label="File">',
      "      {(action) => <MenubarItem>{action.name}</MenubarItem>}",
      "    </MenubarContent>",
      "  </MenubarMenu>",
      "</Menubar>",
    ].join("\n"),
    demos: menubarDemos,
  },
  {
    slug: "message",
    title: "Message",
    description:
      "Displays a message in a conversation, with optional avatar, header, footer, and alignment.",
    usage: [
      importLine("Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader", "message"),
      "",
      '<Message align="start">',
      "  <MessageAvatar>MK</MessageAvatar>",
      "  <MessageContent>",
      "    <MessageHeader>Mira</MessageHeader>",
      "    <Bubble><BubbleContent>\u2026</BubbleContent></Bubble>",
      "    <MessageFooter>09:43</MessageFooter>",
      "  </MessageContent>",
      "</Message>",
    ].join("\n"),
    demos: messageDemos,
  },
  {
    slug: "message-scroller",
    title: "Message Scroller",
    description:
      "A chat scroll container that anchors turns, opens saved transcripts, follows streamed responses, loads history without jumping, and jumps to any message.",
    usage: [
      importLine(
        "MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerViewport",
        "message-scroller",
      ),
      "",
      "<MessageScroller>",
      "  <MessageScrollerViewport>",
      "    <MessageScrollerContent>",
      "      <MessageScrollerItem>\u2026</MessageScrollerItem>",
      "    </MessageScrollerContent>",
      "  </MessageScrollerViewport>",
      "  <MessageScrollerButton />",
      "</MessageScroller>",
    ].join("\n"),
    demos: messageScrollerDemos,
  },
  {
    slug: "native-select",
    title: "Native Select",
    description: "A styled native HTML select element with consistent design system integration.",
    usage: [
      importLine("NativeSelect, NativeSelectOption", "native-select"),
      "",
      '<NativeSelect aria-label="Country">',
      "  <NativeSelectOption>United Kingdom</NativeSelectOption>",
      "</NativeSelect>",
    ].join("\n"),
    demos: nativeSelectDemos,
  },
  {
    slug: "navigation-menu",
    title: "Navigation Menu",
    description: "A collection of links for navigating websites.",
    usage: [
      importLine(
        "NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, NavigationMenuViewport",
        "navigation-menu",
      ),
      "",
      "<NavigationMenu>",
      "  <NavigationMenuList>",
      '    <NavigationMenuItem value="products">',
      "      <NavigationMenuTrigger>Products</NavigationMenuTrigger>",
      "      <NavigationMenuContent>\u2026</NavigationMenuContent>",
      "    </NavigationMenuItem>",
      "  </NavigationMenuList>",
      "  <NavigationMenuIndicator />",
      "  <NavigationMenuViewport />",
      "</NavigationMenu>",
    ].join("\n"),
    demos: navigationMenuDemos,
  },
  {
    slug: "pagination",
    title: "Pagination",
    description: "Pagination with page navigation, next and previous links.",
    usage: [
      importLine(
        "Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious",
        "pagination",
      ),
      "",
      "<Pagination>",
      "  <PaginationContent>",
      '    <PaginationItem><PaginationPrevious href="?page=1" /></PaginationItem>',
      '    <PaginationItem><PaginationLink href="?page=2" isActive>2</PaginationLink></PaginationItem>',
      "  </PaginationContent>",
      "</Pagination>",
    ].join("\n"),
    demos: paginationDemos,
  },
  {
    slug: "popover",
    title: "Popover",
    description: "Displays rich content in a portal, triggered by a button.",
    usage: [
      importLine("Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger", "popover"),
      "",
      "<Popover>",
      "  <PopoverTrigger>",
      '    <Button variant="outline">Open</Button>',
      "  </PopoverTrigger>",
      "  <PopoverContent>\u2026</PopoverContent>",
      "</Popover>",
    ].join("\n"),
    demos: popoverDemos,
  },
  {
    slug: "progress",
    title: "Progress",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
    usage: [importLine("Progress", "progress"), "", '<Progress value={62} label="Upload" />'].join(
      "\n",
    ),
    demos: progressDemos,
  },
  questionnaireDoc,
  {
    slug: "radio-group",
    title: "Radio Group",
    description:
      "A set of checkable buttons \u2014 known as radio buttons \u2014 where no more than one of the buttons can be checked at a time.",
    usage: [
      importLine("RadioGroup, RadioGroupItem", "radio-group"),
      "",
      '<RadioGroup label="Size" defaultValue="m">',
      '  <RadioGroupItem value="s" id="s" />',
      '  <Label for="s">Small</Label>',
      "</RadioGroup>",
    ].join("\n"),
    demos: radioGroupDemos,
  },
  {
    slug: "resizable",
    title: "Resizable",
    description: "Accessible resizable panel groups and layouts with keyboard support.",
    usage: [
      importLine("ResizableHandle, ResizablePanel, ResizablePanelGroup", "resizable"),
      "",
      '<ResizablePanelGroup direction="horizontal">',
      "  <ResizablePanel defaultSize={30}>Sidebar</ResizablePanel>",
      "  <ResizableHandle withHandle />",
      "  <ResizablePanel defaultSize={70}>Editor</ResizablePanel>",
      "</ResizablePanelGroup>",
    ].join("\n"),
    demos: resizableDemos,
  },
  {
    slug: "scroll-area",
    title: "Scroll Area",
    description: "Augments native scroll functionality for custom, cross-browser styling.",
    usage: [
      importLine("ScrollArea", "scroll-area"),
      "",
      '<ScrollArea aria-label="Log" style={{ height: "12rem" }}>',
      "  \u2026",
      "</ScrollArea>",
    ].join("\n"),
    demos: scrollAreaDemos,
  },
  scrollFadeDoc,
  {
    slug: "select",
    title: "Select",
    description:
      "Displays a list of options for the user to pick from \u2014 triggered by a button.",
    usage: [
      importLine("Select, SelectGroup, SelectItem", "select"),
      "",
      '<Select items={fruits} aria-label="Fruit" placeholder="Pick one">',
      "  {(fruit) => <SelectItem>{fruit.name}</SelectItem>}",
      "</Select>",
    ].join("\n"),
    demos: selectDemos,
  },
  {
    slug: "separator",
    title: "Separator",
    description: "Visually or semantically separates content.",
    usage: [
      importLine("Separator", "separator"),
      "",
      "<Separator />",
      '<Separator orientation="vertical" />',
    ].join("\n"),
    demos: separatorDemos,
  },
  {
    slug: "sheet",
    title: "Sheet",
    description:
      "Extends the Dialog component to display content that complements the main content of the screen.",
    usage: [
      importLine("Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger", "sheet"),
      "",
      "<Sheet>",
      "  <SheetTrigger>",
      '    <Button variant="outline">Open</Button>',
      "  </SheetTrigger>",
      "  <SheetContent>\u2026</SheetContent>",
      "</Sheet>",
    ].join("\n"),
    demos: sheetDemos,
  },
  shimmerDoc,
  {
    slug: "sidebar",
    title: "Sidebar",
    description: "A composable, themeable and customizable sidebar component.",
    usage: [
      importLine(
        "Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger",
        "sidebar",
      ),
      "",
      "<SidebarProvider>",
      '  <Sidebar collapsible="icon">',
      "    <SidebarContent>\u2026</SidebarContent>",
      "    <SidebarRail />",
      "  </Sidebar>",
      "  <SidebarInset>\u2026</SidebarInset>",
      "</SidebarProvider>",
    ].join("\n"),
    demos: sidebarDemos,
  },
  {
    slug: "skeleton",
    title: "Skeleton",
    description: "Use to show a placeholder while content is loading.",
    usage: [
      importLine("Skeleton", "skeleton"),
      "",
      '<Skeleton style={{ width: "12rem", height: "1rem" }} />',
    ].join("\n"),
    demos: skeletonDemos,
  },
  {
    slug: "slider",
    title: "Slider",
    description: "An input where the user selects a value from within a given range.",
    usage: [
      importLine("Slider", "slider"),
      "",
      '<Slider aria-label="Volume" defaultValue={30} />',
    ].join("\n"),
    demos: sliderDemos,
  },
  {
    slug: "sonner",
    title: "Sonner",
    description: "An opinionated toast component.",
    usage: [
      importLine("Toaster, toast", "sonner"),
      "",
      "<Toaster />",
      "",
      'toast.success("Everything worked");',
    ].join("\n"),
    demos: sonnerDemos,
  },
  {
    slug: "spinner",
    title: "Spinner",
    description: "An indicator that can be used to show a loading state.",
    usage: [importLine("Spinner", "spinner"), "", "<Spinner />"].join("\n"),
    demos: spinnerDemos,
  },
  {
    slug: "switch",
    title: "Switch",
    description: "A control that allows the user to toggle between checked and not checked.",
    usage: [
      importLine("Switch", "switch"),
      "",
      '<Switch id="wifi" defaultSelected />',
      '<Label for="wifi">Wi-Fi</Label>',
    ].join("\n"),
    demos: switchDemos,
  },
  {
    slug: "table",
    title: "Table",
    description: "A responsive table component.",
    usage: [
      importLine("Table, TableBody, TableCell, TableHead, TableHeader, TableRow", "table"),
      "",
      "<Table>",
      "  <TableHeader>",
      "    <TableRow><TableHead>Invoice</TableHead></TableRow>",
      "  </TableHeader>",
      "  <TableBody>",
      "    <TableRow><TableCell>INV001</TableCell></TableRow>",
      "  </TableBody>",
      "</Table>",
    ].join("\n"),
    demos: tableDemos,
  },
  {
    slug: "tabs",
    title: "Tabs",
    description:
      "A set of layered sections of content \u2014 known as tab panels \u2014 that are displayed one at a time.",
    usage: [
      importLine("Tabs, TabsContent, TabsList, TabsTrigger", "tabs"),
      "",
      "<Tabs items={sections}>",
      '  <TabsList aria-label="Sections">',
      "    {(section) => <TabsTrigger>{section.name}</TabsTrigger>}",
      "  </TabsList>",
      "  <TabsContent>{(section) => <p>{section.body}</p>}</TabsContent>",
      "</Tabs>",
    ].join("\n"),
    demos: tabsDemos,
  },
  {
    slug: "textarea",
    title: "Textarea",
    description: "Displays a form textarea or a component that looks like a textarea.",
    add: "input",
    usage: [
      importLine("Textarea", "input"),
      "",
      '<Textarea placeholder="Tell us what happened" />',
    ].join("\n"),
    demos: textareaDemos,
  },
  toastDoc,
  {
    slug: "toggle",
    title: "Toggle",
    description: "A two-state button that can be either on or off.",
    usage: [
      importLine("Toggle", "toggle"),
      "",
      '<Toggle aria-label="Bold">',
      "  <Bold />",
      "</Toggle>",
    ].join("\n"),
    demos: toggleDemos,
  },
  {
    slug: "toggle-group",
    title: "Toggle Group",
    description: "A set of two-state buttons that can be toggled on or off.",
    usage: [
      importLine("ToggleGroup, ToggleGroupItem", "toggle-group"),
      "",
      '<ToggleGroup type="multiple" variant="outline" aria-label="Format">',
      '  <ToggleGroupItem value="bold" aria-label="Bold"><Bold /></ToggleGroupItem>',
      "</ToggleGroup>",
    ].join("\n"),
    demos: toggleGroupDemos,
  },
  {
    slug: "tooltip",
    title: "Tooltip",
    description:
      "A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.",
    usage: [
      importLine("Tooltip, TooltipContent", "tooltip"),
      "",
      "<Tooltip delay={200}>",
      '  <Button variant="outline">Save</Button>',
      "  <TooltipContent>Saves to the server</TooltipContent>",
      "</Tooltip>",
    ].join("\n"),
    demos: tooltipDemos,
  },
  typographyDoc,
];

export function docNamed(slug: string): ComponentDoc | undefined {
  return COMPONENTS.find((entry) => entry.slug === slug);
}
