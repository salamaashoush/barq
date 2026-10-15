/**
 * One page per module, holding every component the module exports.
 *
 * `ssr.test.ts` renders each in a process with no DOM, and fails for a module
 * in `entries.ts` that has no page here or a component its page leaves out.
 *
 * The component names are imported for the page from the module itself.
 * `<ui>` in `imports` is this package's `src/ui` directory. An overlay is
 * written open, because a closed one never builds its content.
 */

export interface ServerFixture {
  /** What the page needs beyond its own module's components. */
  imports?: string;
  /** Module-level declarations: sample data, a component of the page's own. */
  declare?: string;
  /** Statements run before the render, such as raising a toast. */
  before?: string;
  jsx: string;
}

export const FIXTURES: Readonly<Record<string, ServerFixture>> = {
  "lib/overlay.tsx": {
    jsx: `<OverlayPortal><span>Inside</span></OverlayPortal>`,
  },
  "lib/trigger.tsx": {
    imports: `import { provideTriggerSlot, triggerSlot } from "@barqjs/aria/utils";`,
    declare: `
      function Part() {
        return (
          <TriggerPart
            slot={triggerSlot()}
            name="part"
            render={(trigger) => <button {...trigger.props} ref={trigger.ref}>Open</button>}
          />
        );
      }
    `,
    jsx: `<Part />`,
  },
  "ui/accordion.tsx": {
    jsx: `
      <Accordion type="single" collapsible defaultValue="shipping">
        <AccordionItem value="shipping">
          <AccordionTrigger>Shipping</AccordionTrigger>
          <AccordionContent>Two days.</AccordionContent>
        </AccordionItem>
        <AccordionItem value="returns">
          <AccordionTrigger>Returns</AccordionTrigger>
          <AccordionContent>Thirty days.</AccordionContent>
        </AccordionItem>
      </Accordion>
    `,
  },
  "ui/alert-dialog.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <AlertDialog isOpen>
        <AlertDialogTrigger><Button>Delete</Button></AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogOverlay />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>!</AlertDialogMedia>
              <AlertDialogTitle>Delete the project?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    `,
  },
  "ui/alert.tsx": {
    jsx: `
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>The build is running.</AlertDescription>
        <AlertAction><button type="button">Undo</button></AlertAction>
      </Alert>
    `,
  },
  "ui/aspect-ratio.tsx": {
    jsx: `<AspectRatio ratio={16 / 9}><div>Cover</div></AspectRatio>`,
  },
  "ui/attachment.tsx": {
    jsx: `
      <AttachmentGroup>
        <Attachment state="uploading">
          <AttachmentMedia>PDF</AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>report.pdf</AttachmentTitle>
            <AttachmentDescription>2.4 MB</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction aria-label="Remove report.pdf">x</AttachmentAction>
          </AttachmentActions>
        </Attachment>
        <Attachment>
          <AttachmentTrigger aria-label="Open notes.txt" />
          <AttachmentContent><AttachmentTitle>notes.txt</AttachmentTitle></AttachmentContent>
        </Attachment>
      </AttachmentGroup>
    `,
  },
  "ui/avatar.tsx": {
    jsx: `
      <AvatarGroup>
        <Avatar>
          <AvatarImage src="https://example.com/salama.png" alt="salama" />
          <AvatarFallback>SA</AvatarFallback>
          <AvatarBadge />
        </Avatar>
        <Avatar><AvatarFallback delayMs={600}>AC</AvatarFallback></Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    `,
  },
  "ui/badge.tsx": {
    jsx: `<div><Badge>New</Badge><Badge href="https://example.com" variant="outline">Docs</Badge></div>`,
  },
  "ui/breadcrumb.tsx": {
    jsx: `
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Settings</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    `,
  },
  "ui/bubble.tsx": {
    jsx: `
      <BubbleGroup>
        <Bubble align="end">
          <BubbleContent>Sounds good</BubbleContent>
          <BubbleReactions>+1</BubbleReactions>
        </Bubble>
        <Bubble><BubbleContent href="https://example.com">A link</BubbleContent></Bubble>
      </BubbleGroup>
    `,
  },
  "ui/button-group.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <ButtonGroup aria-label="History">
        <Button>Back</Button>
        <ButtonGroupSeparator />
        <ButtonGroupText>Page 2</ButtonGroupText>
        <Button>Forward</Button>
      </ButtonGroup>
    `,
  },
  "ui/button.tsx": {
    jsx: `<div><Button>Save</Button><Button href="https://example.com" variant="link">Docs</Button></div>`,
  },
  "ui/calendar.tsx": {
    imports: `
      import { calendarCell, calendarState } from "@barqjs/aria/calendar";
      import { CalendarDate } from "@barqjs/aria/date";
    `,
    declare: `
      const MARCH = new CalendarDate(2024, 3, 7);
      function OwnDays() {
        const state = calendarState({ defaultFocusedValue: MARCH });
        const cell = calendarCell({ date: MARCH }, state);
        return (
          <div>
            <CalendarDay state={state} date={MARCH} />
            <CalendarDayButton cell={cell} date={MARCH}>7</CalendarDayButton>
          </div>
        );
      }
    `,
    jsx: `
      <div>
        <Calendar aria-label="Departure" defaultFocusedValue={MARCH} captionLayout="dropdown" />
        <MultipleCalendar aria-label="Shifts" defaultFocusedValue={MARCH} defaultValue={[MARCH]} />
        <RangeCalendar aria-label="Stay" defaultFocusedValue={MARCH} numberOfMonths={2} showWeekNumber />
        <OwnDays />
      </div>
    `,
  },
  "ui/card.tsx": {
    jsx: `
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Twelve this month.</CardDescription>
          <CardAction><button type="button">Export</button></CardAction>
        </CardHeader>
        <CardContent>Four unpaid.</CardContent>
        <CardFooter>Acme Inc</CardFooter>
      </Card>
    `,
  },
  "ui/carousel.tsx": {
    jsx: `
      <Carousel aria-label="Photos">
        <CarouselContent>
          <CarouselItem>One</CarouselItem>
          <CarouselItem>Two</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    `,
  },
  "ui/chart.tsx": {
    imports: `
      import { barY, defineChart } from "@tanstack/charts";
      import { scaleBand } from "@tanstack/charts/scales/band";
      import { scaleLinear } from "@tanstack/charts/scales/linear";
    `,
    declare: `
      const ROWS = [
        { month: "January", sales: 186, returns: 12 },
        { month: "February", sales: 305, returns: 20 },
      ];
      const CONFIG = {
        sales: { label: "Sales", color: "var(--chart-1)" },
        returns: { label: "Returns", theme: { light: "#b91c1c", dark: "#fca5a5" } },
      };
      const DEFINITION = defineChart({
        marks: [barY(ROWS, { x: "month", y: "sales" })],
        scales: { x: { scale: scaleBand }, y: { scale: scaleLinear } },
      });
    `,
    jsx: `
      <div>
        <ChartStyle id="standalone" config={CONFIG} />
        <ChartContainer config={CONFIG} aria-label="Sales by month">
          <ChartBars data={ROWS} x="month" />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent hideIcon />} />
        </ChartContainer>
        <ChartContainer config={CONFIG}>
          <ChartLines data={ROWS} x="month" area />
          <ChartTooltip />
          <ChartLegend />
        </ChartContainer>
        <ChartContainer config={CONFIG}>
          <Chart definition={DEFINITION} ariaLabel="Sales" initialWidth={320} height={200} />
        </ChartContainer>
      </div>
    `,
  },
  "ui/checkbox.tsx": {
    jsx: `<div><Checkbox defaultChecked>Accept the terms</Checkbox><Checkbox aria-label="Remember" /></div>`,
  },
  "ui/collapsible.tsx": {
    jsx: `
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    `,
  },
  "ui/combobox.tsx": {
    declare: `const FRAMEWORKS = ["Barq", "Solid", "Svelte"];`,
    jsx: `
      <div>
        <Combobox items={FRAMEWORKS} defaultValue="Barq" defaultOpen>
          <ComboboxInput placeholder="Pick a framework" showClear />
          <ComboboxContent>
            <ComboboxEmpty>No framework found.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxGroup>
                <ComboboxLabel>Frameworks</ComboboxLabel>
                <ComboboxCollection>
                  {(item) => <ComboboxItem value={item}>{item}</ComboboxItem>}
                </ComboboxCollection>
              </ComboboxGroup>
              <ComboboxSeparator />
              <ComboboxItem value="Other">Other</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Combobox multiple defaultValue={["Barq"]}>
          <ComboboxChips>
            <ComboboxValue>
              {(values) => values.map((value) => <ComboboxChip value={value}>{value}</ComboboxChip>)}
            </ComboboxValue>
            <ComboboxChipsInput placeholder="Add" />
          </ComboboxChips>
          <ComboboxTrigger />
          <ComboboxClear />
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value="Barq">Barq</ComboboxItem>
              <ComboboxItem value="Solid">Solid</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    `,
  },
  "ui/command.tsx": {
    jsx: `
      <div>
        <Command label="Commands">
          <CommandInput placeholder="Type a command" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandLoading>Fetching</CommandLoading>
            <CommandGroup heading="Settings">
              <CommandItem>Profile<CommandShortcut>P</CommandShortcut></CommandItem>
              <CommandItem disabled>Billing</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandItem value="sign-out">Sign out</CommandItem>
          </CommandList>
        </Command>
        <CommandDialog isOpen title="Palette" description="Search for a command">
          <Command label="Palette">
            <CommandInput placeholder="Search" />
            <CommandList><CommandItem>Open</CommandItem></CommandList>
          </Command>
        </CommandDialog>
      </div>
    `,
  },
  "ui/context-menu.tsx": {
    jsx: `
      <ContextMenu defaultOpen>
        <ContextMenuTrigger render={(trigger) => <div {...trigger.props} ref={trigger.ref}>Right-click</div>} />
        <ContextMenuPortal>
          <ContextMenuContent>
            <ContextMenuLabel>File</ContextMenuLabel>
            <ContextMenuGroup>
              <ContextMenuGroupLabel>Edit</ContextMenuGroupLabel>
              <ContextMenuItem>Copy<ContextMenuShortcut>C</ContextMenuShortcut></ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuCheckboxItem checked>Show hidden</ContextMenuCheckboxItem>
            <ContextMenuRadioGroup value="list">
              <ContextMenuRadioItem value="list">List</ContextMenuRadioItem>
              <ContextMenuRadioItem value="grid">Grid</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Share</ContextMenuSubTrigger>
              <ContextMenuSubContent><ContextMenuItem>Email</ContextMenuItem></ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>
    `,
  },
  "ui/date-picker.tsx": {
    imports: `import { CalendarDate } from "@barqjs/aria/date";`,
    declare: `const MARCH = new CalendarDate(2024, 3, 7);`,
    jsx: `
      <div>
        <DatePicker defaultValue={MARCH} presets={[{ label: "Tomorrow", value: 1 }]} defaultOpen />
        <DateRangePicker defaultValue={{ start: MARCH, end: MARCH.add({ days: 3 }) }} />
        <DatePickerInput id="start" defaultValue={MARCH} />
      </div>
    `,
  },
  "ui/dialog.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <Dialog isOpen>
        <DialogTrigger><Button>Open</Button></DialogTrigger>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>Change what others see.</DialogDescription>
            </DialogHeader>
            <DialogFooter><DialogClose>Done</DialogClose></DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    `,
  },
  "ui/direction.tsx": {
    jsx: `<DirectionProvider dir="rtl"><span>Mirrored</span></DirectionProvider>`,
  },
  "ui/drawer.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <div>
        <Drawer isOpen>
          <DrawerTrigger><Button>Goal</Button></DrawerTrigger>
          <DrawerContent>
            <DrawerHandle />
            <DrawerHeader>
              <DrawerTitle>Move goal</DrawerTitle>
              <DrawerDescription>Set a daily target.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter><DrawerClose>Done</DrawerClose></DrawerFooter>
          </DrawerContent>
        </Drawer>
        <Drawer isOpen direction="right">
          <DrawerPortal>
            <DrawerOverlay />
          </DrawerPortal>
        </Drawer>
      </div>
    `,
  },
  "ui/dropdown-menu.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger><Button>Menu</Button></DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuGroupLabel>Profile</DropdownMenuGroupLabel>
              <DropdownMenuItem>Settings<DropdownMenuShortcut>S</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked>Status bar</DropdownMenuCheckboxItem>
            <DropdownMenuRadioGroup value="top">
              <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Invite</DropdownMenuSubTrigger>
              <DropdownMenuSubContent><DropdownMenuItem>Email</DropdownMenuItem></DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    `,
  },
  "ui/empty.tsx": {
    jsx: `
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">0</EmptyMedia>
          <EmptyTitle>No projects</EmptyTitle>
          <EmptyDescription>Create one to begin.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><button type="button">Create</button></EmptyContent>
      </Empty>
    `,
  },
  "ui/field.tsx": {
    jsx: `
      <FieldSet>
        <FieldLegend>Profile</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel for="name">Name</FieldLabel>
            <input id="name" />
            <FieldDescription>As it appears on invoices.</FieldDescription>
            <FieldError errors={[{ message: "Required" }]} />
          </Field>
          <FieldSeparator>or</FieldSeparator>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Newsletter</FieldTitle>
              <FieldDescription>Once a month.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    `,
  },
  "ui/hover-card.tsx": {
    jsx: `
      <HoverCard isOpen>
        <HoverCardTrigger render={(trigger) => <a {...trigger.props} ref={trigger.ref} href="https://example.com">@salama</a>} />
        <HoverCardContent>Joined in 2021.</HoverCardContent>
      </HoverCard>
    `,
  },
  "ui/input-group.tsx": {
    jsx: `
      <div>
        <InputGroup>
          <InputGroupAddon><InputGroupText>https://</InputGroupText></InputGroupAddon>
          <InputGroupInput placeholder="example.com" />
          <InputGroupAddon align="inline-end"><InputGroupButton>Go</InputGroupButton></InputGroupAddon>
        </InputGroup>
        <InputGroup><InputGroupTextarea placeholder="Message" /></InputGroup>
      </div>
    `,
  },
  "ui/input-otp.tsx": {
    jsx: `
      <InputOTP maxLength={4} defaultValue="12" aria-label="Code">
        <InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /></InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup><InputOTPSlot index={2} /><InputOTPSlot index={3} /></InputOTPGroup>
      </InputOTP>
    `,
  },
  "ui/input.tsx": {
    jsx: `<div><Input placeholder="salama@example.com" type="email" /><Textarea placeholder="Notes" /></div>`,
  },
  "ui/item.tsx": {
    jsx: `
      <ItemGroup>
        <Item variant="outline">
          <ItemHeader>Plan</ItemHeader>
          <ItemMedia variant="icon">A</ItemMedia>
          <ItemContent>
            <ItemTitle>Acme Inc</ItemTitle>
            <ItemDescription>Billed yearly.</ItemDescription>
          </ItemContent>
          <ItemActions><button type="button">Change</button></ItemActions>
          <ItemFooter>Renews in March</ItemFooter>
        </Item>
        <ItemSeparator />
        <Item href="https://example.com"><ItemContent><ItemTitle>Docs</ItemTitle></ItemContent></Item>
      </ItemGroup>
    `,
  },
  "ui/kbd.tsx": {
    jsx: `<KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup>`,
  },
  "ui/label.tsx": {
    jsx: `<Label for="terms">Accept the terms</Label>`,
  },
  "ui/marker.tsx": {
    jsx: `
      <Marker variant="separator">
        <MarkerIcon>*</MarkerIcon>
        <MarkerContent>Yesterday</MarkerContent>
      </Marker>
    `,
  },
  "ui/menubar.tsx": {
    jsx: `
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarPortal>
            <MenubarContent>
              <MenubarLabel>Document</MenubarLabel>
              <MenubarGroup>
                <MenubarGroupLabel>Create</MenubarGroupLabel>
                <MenubarItem>New tab<MenubarShortcut>T</MenubarShortcut></MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarCheckboxItem checked>Always on top</MenubarCheckboxItem>
              <MenubarRadioGroup value="a">
                <MenubarRadioItem value="a">salama</MenubarRadioItem>
                <MenubarRadioItem value="b">Guest</MenubarRadioItem>
              </MenubarRadioGroup>
              <MenubarSub>
                <MenubarSubTrigger>Share</MenubarSubTrigger>
                <MenubarSubContent><MenubarItem>Email</MenubarItem></MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent><MenubarItem>Undo</MenubarItem></MenubarContent>
        </MenubarMenu>
      </Menubar>
    `,
  },
  "ui/message-scroller.tsx": {
    jsx: `
      <MessageScrollerProvider autoScroll>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              <MessageScrollerItem>Hello</MessageScrollerItem>
              <MessageScrollerItem>On my way</MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    `,
  },
  "ui/message.tsx": {
    jsx: `
      <MessageGroup>
        <Message align="end">
          <MessageAvatar>SA</MessageAvatar>
          <MessageContent>
            <MessageHeader>salama</MessageHeader>
            <p>On my way</p>
            <MessageFooter>Sent</MessageFooter>
          </MessageContent>
        </Message>
      </MessageGroup>
    `,
  },
  "ui/native-select.tsx": {
    jsx: `
      <NativeSelect aria-label="Fruit" defaultValue="apple">
        <NativeSelectOption value="">Pick one</NativeSelectOption>
        <NativeSelectOptGroup label="Fruits">
          <NativeSelectOption value="apple">Apple</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>
    `,
  },
  "ui/navigation-menu.tsx": {
    jsx: `
      <NavigationMenu defaultValue="docs">
        <NavigationMenuList>
          <NavigationMenuItem value="docs">
            <NavigationMenuTrigger>Docs</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="https://example.com/start">Getting started</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="https://example.com/pricing">Pricing</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuIndicator />
        </NavigationMenuList>
        <NavigationMenuViewport />
      </NavigationMenu>
    `,
  },
  "ui/pagination.tsx": {
    jsx: `
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="?page=1" /></PaginationItem>
          <PaginationItem><PaginationLink href="?page=1">1</PaginationLink></PaginationItem>
          <PaginationItem><PaginationLink href="?page=2" isActive>2</PaginationLink></PaginationItem>
          <PaginationItem><PaginationEllipsis /></PaginationItem>
          <PaginationItem><PaginationNext href="?page=3" /></PaginationItem>
        </PaginationContent>
      </Pagination>
    `,
  },
  "ui/popover.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <Popover isOpen>
        <PopoverAnchor><span>Anchor</span></PopoverAnchor>
        <PopoverTrigger><Button>Size</Button></PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Dimensions</PopoverTitle>
            <PopoverDescription>Set the width.</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    `,
  },
  "ui/progress.tsx": {
    jsx: `
      <div>
        <Progress value={60} label="Upload" />
        <Progress value={30}>
          <ProgressLabel>Sync</ProgressLabel>
          <ProgressValue />
          <ProgressTrack><ProgressIndicator /></ProgressTrack>
        </Progress>
      </div>
    `,
  },
  "ui/questionnaire.tsx": {
    jsx: `
      <Questionnaire>
        <QuestionnaireProgress />
        <QuestionnaireItem name="plan" required>
          <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
          <QuestionnaireDescription>You can change it later.</QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="plus">
              Plus
              <QuestionnaireChoiceDescription>For one person.</QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireChoice value="pro">Pro</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireItem name="company">
          <QuestionnaireTitle>Where do you work?</QuestionnaireTitle>
          <QuestionnaireInput placeholder="Acme Inc" />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireSkip />
          <QuestionnaireNext />
          <QuestionnaireSubmit />
        </QuestionnaireActions>
      </Questionnaire>
    `,
  },
  "ui/radio-group.tsx": {
    jsx: `
      <RadioGroup aria-label="Plan" defaultValue="pro">
        <RadioGroupItem value="plus">Plus</RadioGroupItem>
        <RadioGroupItem value="pro">Pro</RadioGroupItem>
      </RadioGroup>
    `,
  },
  "ui/resizable.tsx": {
    jsx: `
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={40}>Files</ResizablePanel>
        <ResizableHandle withHandle aria-label="Resize files" />
        <ResizablePanel defaultSize={60}>Editor</ResizablePanel>
      </ResizablePanelGroup>
    `,
  },
  "ui/scroll-area.tsx": {
    jsx: `
      <ScrollArea aria-label="Artwork">
        <p>Row</p>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    `,
  },
  "ui/select.tsx": {
    jsx: `
      <form>
        <Select defaultValue="apple" defaultOpen>
          <SelectTrigger aria-label="Fruit"><SelectValue placeholder="Pick one" /></SelectTrigger>
          <SelectContent>
            <SelectScrollUpButton />
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectSeparator />
              <SelectItem value="banana">Banana</SelectItem>
            </SelectGroup>
            <SelectScrollDownButton />
          </SelectContent>
        </Select>
        <Select aria-label="Size" items={[{ id: "s", label: "Small" }, { id: "l", label: "Large" }]} />
      </form>
    `,
  },
  "ui/separator.tsx": {
    jsx: `<div><Separator /><Separator orientation="vertical" decorative /></div>`,
  },
  "ui/sheet.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <Sheet isOpen>
        <SheetTrigger><Button>Filters</Button></SheetTrigger>
        <SheetPortal>
          <SheetOverlay />
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow the list.</SheetDescription>
            </SheetHeader>
            <SheetFooter><SheetClose>Apply</SheetClose></SheetFooter>
          </SheetContent>
        </SheetPortal>
      </Sheet>
    `,
  },
  "ui/sidebar.tsx": {
    jsx: `
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader><SidebarInput placeholder="Search" /></SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarGroupAction aria-label="Add project">+</SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="Acme Inc">Acme Inc</SidebarMenuButton>
                    <SidebarMenuAction aria-label="More">...</SidebarMenuAction>
                    <SidebarMenuBadge>4</SidebarMenuBadge>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="https://example.com">Docs</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                  <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
          </SidebarContent>
          <SidebarFooter>salama</SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset><SidebarTrigger />Page</SidebarInset>
      </SidebarProvider>
    `,
  },
  "ui/skeleton.tsx": {
    jsx: `<Skeleton style={{ height: "1rem" }} />`,
  },
  "ui/slider.tsx": {
    jsx: `<div><Slider aria-label="Volume" defaultValue={[40]} /><Slider aria-label="Range" defaultValue={[20, 80]} orientation="vertical" /></div>`,
  },
  "ui/sonner.tsx": {
    imports: `import { toast } from "<ui>/sonner.tsx";`,
    before: `
      toast.success("Saved", {
        description: "Three files",
        action: { label: "Undo", onClick: () => {} },
      });
      toast.loading("Uploading");
      toast.error("Not sent", { cancel: { label: "Dismiss", onClick: () => {} } });
    `,
    jsx: `<Toaster richColors position="top-center" />`,
  },
  "ui/spinner.tsx": {
    jsx: `<Spinner data-icon="inline-start" />`,
  },
  "ui/switch.tsx": {
    jsx: `<Switch defaultSelected>Airplane mode</Switch>`,
  },
  "ui/table.tsx": {
    jsx: `
      <Table>
        <TableCaption>Recent invoices</TableCaption>
        <TableHeader><TableRow><TableHead>Invoice</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>INV001</TableCell></TableRow></TableBody>
        <TableFooter><TableRow><TableCell>Total</TableCell></TableRow></TableFooter>
      </Table>
    `,
  },
  "ui/tabs.tsx": {
    jsx: `
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Name</TabsContent>
        <TabsContent value="password">Secret</TabsContent>
      </Tabs>
    `,
  },
  "ui/textarea.tsx": {
    jsx: `<Textarea placeholder="Notes" rows={3} />`,
  },
  "ui/toast.tsx": {
    imports: `import { createToastManager, toast } from "<ui>/toast.tsx";`,
    declare: `const OWN = createToastManager();`,
    before: `
      toast.add({ title: "Event created", description: "Sunday at 9:00", type: "success" });
      toast.add({ title: "Offline", priority: "high" });
      OWN.add({ title: "Written by hand", description: "From parts" });
    `,
    jsx: `
      <div>
        <Toaster />
        <ToastProvider toastManager={OWN}>
          <ToastPortal>
            <ToastViewport>
              {OWN.toasts().map((one) => (
                <Toast toast={one}>
                  <ToastContent>
                    <ToastTitle />
                    <ToastDescription />
                    <ToastAction>Undo</ToastAction>
                    <ToastClose aria-label="Close" />
                  </ToastContent>
                </Toast>
              ))}
            </ToastViewport>
          </ToastPortal>
        </ToastProvider>
      </div>
    `,
  },
  "ui/toggle-group.tsx": {
    jsx: `
      <ToggleGroup type="single" aria-label="Alignment" defaultValue="start">
        <ToggleGroupItem value="start">Start</ToggleGroupItem>
        <ToggleGroupItem value="end">End</ToggleGroupItem>
      </ToggleGroup>
    `,
  },
  "ui/toggle.tsx": {
    jsx: `<Toggle aria-label="Bold" defaultPressed>B</Toggle>`,
  },
  "ui/tooltip.tsx": {
    imports: `import { Button } from "<ui>/button.tsx";`,
    jsx: `
      <TooltipProvider>
        <Tooltip isOpen>
          <TooltipTrigger><Button>Help</Button></TooltipTrigger>
          <TooltipContent>Opens the guide</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    `,
  },
};
