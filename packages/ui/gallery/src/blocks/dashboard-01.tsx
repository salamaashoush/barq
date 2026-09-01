/**
 * shadcn's `dashboard-01`, ported from
 * `apps/v4/registry/new-york-v4/blocks/dashboard-01/`.
 *
 * The flagship block, and the one worth having in a theme picker: an inset
 * sidebar, a header, four stat cards, an interactive area chart and a data
 * table with tabs, a row menu and pagination. Between them they put a sidebar,
 * a chart, a table, tabs, a toggle group, a select, checkboxes, badges and a
 * dropdown on the screen at once, which is most of what a style has an opinion
 * about.
 *
 * TWO THINGS ARE NOT UPSTREAM'S and both are the dependency rather than the
 * design. Their table is TanStack Table with drag-and-drop reordering, column
 * visibility and a row detail drawer; this renders the same markup from plain
 * data, because the point here is the LOOK of a table under eight styles and a
 * table engine is a different package's problem. Their icons are `@tabler`;
 * these are lucide, which is this package's one icon set by decision.
 */

import { For, signal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLines,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
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
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/ui";
import { ChartBar } from "@barqjs/lucide/icons/chart-bar";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { CircleQuestionMark } from "@barqjs/lucide/icons/circle-question-mark";
import { Database } from "@barqjs/lucide/icons/database";
import { EllipsisVertical } from "@barqjs/lucide/icons/ellipsis-vertical";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Folder } from "@barqjs/lucide/icons/folder";
import { LayoutDashboard } from "@barqjs/lucide/icons/layout-dashboard";
import { ListChecks } from "@barqjs/lucide/icons/list-checks";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Search } from "@barqjs/lucide/icons/search";
import { Settings } from "@barqjs/lucide/icons/settings";
import { TrendingDown } from "@barqjs/lucide/icons/trending-down";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";
import { Users } from "@barqjs/lucide/icons/users";

const shell = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const header = css`
  display: flex;
  height: 3rem;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
`;

const headerInner = css`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 1rem;
`;

const headerTitle = css`
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
`;

const spacer = css`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const body = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding-block: 1rem;
  min-width: 0;
`;

/*
 * `@xl/main:grid-cols-2 @5xl/main:grid-cols-4` upstream, which is a container
 * query on the dashboard's own main column rather than on the window — the same
 * reason the showcase uses one. The preview is not the viewport.
 */
const cards = css`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  padding-inline: 1rem;

  @container preview (width >= 36rem) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @container preview (width >= 64rem) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding-inline: 1.5rem;
  }
`;

const figure = css`
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const foot = css`
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  font-size: 0.875rem;
`;

const trend = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;

  & svg {
    width: 1rem;
    height: 1rem;
  }
`;

const muted = css`
  color: var(--muted-foreground);
`;

const padded = css`
  padding-inline: 1rem;

  @container preview (width >= 64rem) {
    padding-inline: 1.5rem;
  }
`;

const tableWrap = css`
  overflow: hidden;
  border-radius: var(--radius);
  border: 1px solid var(--border);
`;

const tableTop = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-inline: 1rem;

  @container preview (width >= 64rem) {
    padding-inline: 1.5rem;
  }
`;

const pager = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-inline: 1rem;
  font-size: 0.875rem;
  color: var(--muted-foreground);

  @container preview (width >= 64rem) {
    padding-inline: 1.5rem;
  }
`;

/** `aspect-auto h-[250px] w-full`, upstream's: a chart that grows with the card fills it. */
const chartBox = css`
  height: 250px;
  width: 100%;
`;

const pagerButtons = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

/** `data-[slot=sidebar-menu-button]:p-1.5!`, upstream's, and the reason is above. */
const brandButton = css`
  padding: 0.375rem !important;
`;

const brandIcon = css`
  width: 1.25rem !important;
  height: 1.25rem !important;
`;

const brandText = css`
  font-size: 1rem;
  font-weight: 600;
`;

/**
 * `size-8`, which is upstream's and is the same arithmetic as the brand.
 *
 * Collapsed, the button is 32px with `p-0`, so a 32px avatar fills it and the
 * name beside it starts at 40 and is clipped entirely. At 28px the text started
 * at 36 and four pixels of the address showed against the rail.
 */
const userAvatar = css`
  width: 2rem;
  height: 2rem;
  flex: none;
`;

const userText = css`
  display: grid;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.25;

  & strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const NAV_MAIN = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard, active: true },
  { id: "lifecycle", name: "Lifecycle", icon: ListChecks },
  { id: "analytics", name: "Analytics", icon: ChartBar },
  { id: "projects", name: "Projects", icon: Folder },
  { id: "team", name: "Team", icon: Users },
];

const NAV_DOCUMENTS = [
  { id: "library", name: "Data Library", icon: Database },
  { id: "reports", name: "Reports", icon: FileText },
  { id: "assistant", name: "Word Assistant", icon: FileText },
];

const NAV_SECONDARY = [
  { id: "settings", name: "Settings", icon: Settings },
  { id: "help", name: "Get Help", icon: CircleQuestionMark },
  { id: "search", name: "Search", icon: Search },
];

const STATS = [
  {
    id: "revenue",
    name: "Total Revenue",
    value: "$1,250.00",
    delta: "+12.5%",
    up: true,
    headline: "Trending up this month",
    note: "Visitors for the last 6 months",
  },
  {
    id: "customers",
    name: "New Customers",
    value: "1,234",
    delta: "-20%",
    up: false,
    headline: "Down 20% this period",
    note: "Acquisition needs attention",
  },
  {
    id: "accounts",
    name: "Active Accounts",
    value: "45,678",
    delta: "+12.5%",
    up: true,
    headline: "Strong user retention",
    note: "Engagement exceed targets",
  },
  {
    id: "growth",
    name: "Growth Rate",
    value: "4.5%",
    delta: "+4.5%",
    up: true,
    headline: "Steady performance increase",
    note: "Meets growth projections",
  },
];

const RANGES = [
  { id: "90d", name: "Last 3 months" },
  { id: "30d", name: "Last 30 days" },
  { id: "7d", name: "Last 7 days" },
];

const CHART_CONFIG = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
];

/** Ninety days is what upstream ships; twelve points read the same at this size. */
const VISITORS = [
  { date: "Apr 1", desktop: 222, mobile: 150 },
  { date: "Apr 8", desktop: 312, mobile: 210 },
  { date: "Apr 15", desktop: 268, mobile: 190 },
  { date: "Apr 22", desktop: 341, mobile: 240 },
  { date: "Apr 29", desktop: 289, mobile: 176 },
  { date: "May 6", desktop: 402, mobile: 301 },
  { date: "May 13", desktop: 358, mobile: 264 },
  { date: "May 20", desktop: 431, mobile: 322 },
  { date: "May 27", desktop: 377, mobile: 288 },
  { date: "Jun 3", desktop: 465, mobile: 340 },
  { date: "Jun 10", desktop: 412, mobile: 296 },
  { date: "Jun 17", desktop: 498, mobile: 371 },
];

const TABS = [
  { id: "outline", name: "Outline" },
  { id: "past-performance", name: "Past Performance", count: 3 },
  { id: "key-personnel", name: "Key Personnel", count: 2 },
  { id: "focus-documents", name: "Focus Documents" },
];

const ROWS = [
  {
    id: "1",
    header: "Cover page",
    type: "Cover page",
    status: "In Process",
    target: "18",
    limit: "5",
    reviewer: "Eddie Lake",
  },
  {
    id: "2",
    header: "Table of contents",
    type: "Table of contents",
    status: "Done",
    target: "29",
    limit: "24",
    reviewer: "Eddie Lake",
  },
  {
    id: "3",
    header: "Executive summary",
    type: "Narrative",
    status: "Done",
    target: "10",
    limit: "13",
    reviewer: "Eddie Lake",
  },
  {
    id: "4",
    header: "Technical approach",
    type: "Narrative",
    status: "Done",
    target: "27",
    limit: "23",
    reviewer: "Jamik Tashpulatov",
  },
  {
    id: "5",
    header: "Design",
    type: "Narrative",
    status: "In Process",
    target: "2",
    limit: "16",
    reviewer: "Jamik Tashpulatov",
  },
  {
    id: "6",
    header: "Capabilities",
    type: "Narrative",
    status: "In Process",
    target: "20",
    limit: "8",
    reviewer: "Jamik Tashpulatov",
  },
  {
    id: "7",
    header: "Integration with existing systems",
    type: "Narrative",
    status: "In Process",
    target: "19",
    limit: "21",
    reviewer: "Jamik Tashpulatov",
  },
  {
    id: "8",
    header: "Innovation and Advantages",
    type: "Narrative",
    status: "Done",
    target: "25",
    limit: "26",
    reviewer: "Assign reviewer",
  },
];

const ROW_ACTIONS = [
  { id: "edit", name: "Edit" },
  { id: "copy", name: "Make a copy" },
  { id: "favorite", name: "Favorite" },
  { id: "delete", name: "Delete" },
];

function NavGroup(props: Incoming<{ label?: string; items: typeof NAV_MAIN }>) {
  return (
    <SidebarGroup>
      {props.label?.() === undefined ? null : (
        <SidebarGroupLabel>{props.label()}</SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          <For each={() => props.items()}>
            {(entry: (typeof NAV_MAIN)[number]) => (
              <SidebarMenuItem>
                <SidebarMenuButton href="#" isActive={entry.active === true}>
                  <entry.icon />
                  <span>{entry.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </For>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function Dashboard01() {
  const range = signal("90d");
  const page = signal(1);

  const shown = (): typeof VISITORS => {
    const keep = range() === "7d" ? 3 : range() === "30d" ? 6 : VISITORS.length;
    return VISITORS.slice(-keep);
  };

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* The icon and the label are DIRECT children, which is how
                  upstream writes every one of these. A wrapper in between takes
                  the button's `[&>svg]:shrink-0` and `[&>span:last-child]:truncate`
                  off the things they name, and when the sidebar collapses to a
                  32px square the wrapper keeps laying out at its own width
                  inside it — "Acme Inc." wrapped to two clipped letters.

                  The default size with `p-1.5!` and a 20px icon, which is
                  upstream's and is doing arithmetic: collapsed, the button is
                  32px, so 6 + 20 + an 8px gap puts the label at 34 and it is
                  clipped ENTIRELY. At `size="lg"` with `p-0` the label starts at
                  24 and eight pixels of "Acme Inc." show as a stray A. */}
              <SidebarMenuButton href="#" class={brandButton}>
                <LayoutDashboard class={brandIcon} />
                <span class={brandText}>Acme Inc.</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup items={NAV_MAIN} />
          <NavGroup label="Documents" items={NAV_DOCUMENTS} />
          <NavGroup label="Support" items={NAV_SECONDARY} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <Avatar class={userAvatar}>
                  <AvatarFallback>SA</AvatarFallback>
                </Avatar>
                <span class={userText}>
                  <strong>sashoush</strong>
                  <span class={muted}>me@example.com</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div class={shell}>
          <header class={header}>
            <div class={headerInner}>
              <SidebarTrigger />
              <Separator orientation="vertical" />
              <h1 class={headerTitle}>Documents</h1>
              <div class={spacer}>
                <Button variant="ghost" size="sm">
                  GitHub
                </Button>
              </div>
            </div>
          </header>

          <div class={body}>
            <div class={cards}>
              <For each={() => STATS}>
                {(stat: (typeof STATS)[number]) => (
                  <Card>
                    <CardHeader>
                      <CardDescription>{stat.name}</CardDescription>
                      <CardTitle class={figure}>{stat.value}</CardTitle>
                      <CardAction>
                        <Badge variant="outline">
                          {stat.up ? <TrendingUp /> : <TrendingDown />}
                          {stat.delta}
                        </Badge>
                      </CardAction>
                    </CardHeader>
                    <CardFooter class={foot}>
                      <div class={trend}>
                        {stat.headline}
                        {stat.up ? <TrendingUp /> : <TrendingDown />}
                      </div>
                      <div class={muted}>{stat.note}</div>
                    </CardFooter>
                  </Card>
                )}
              </For>
            </div>

            <div class={padded}>
              <Card>
                <CardHeader>
                  <CardTitle>Total Visitors</CardTitle>
                  <CardDescription>Total for the last 3 months</CardDescription>
                  <CardAction>
                    <ToggleGroup
                      variant="outline"
                      type="single"
                      value={[range()]}
                      onChange={(value: string[]) => {
                        const first = value[0];
                        if (first !== undefined) range.set(first);
                      }}
                      aria-label="Time range"
                    >
                      <For each={() => RANGES}>
                        {(entry: (typeof RANGES)[number]) => (
                          <ToggleGroupItem value={entry.id}>{entry.name}</ToggleGroupItem>
                        )}
                      </For>
                    </ToggleGroup>
                  </CardAction>
                </CardHeader>
                <CardContentChart data={shown()} />
              </Card>
            </div>

            <Tabs items={TABS} defaultSelectedKey="outline">
              <div class={tableTop}>
                <TabsList aria-label="Document sections">
                  {(tab: (typeof TABS)[number]) => (
                    <TabsTrigger>
                      {tab.name}
                      {tab.count === undefined ? null : (
                        <Badge variant="secondary">{String(tab.count)}</Badge>
                      )}
                    </TabsTrigger>
                  )}
                </TabsList>
                <Button variant="outline" size="sm">
                  <Plus />
                  Add Section
                </Button>
              </div>
              <TabsContent>
                {(tab: (typeof TABS)[number]) => (
                  <div class={padded} data-tab={tab.id}>
                    <div class={tableWrap}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <Checkbox aria-label="Select all" />
                            </TableHead>
                            <TableHead>Header</TableHead>
                            <TableHead>Section Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Limit</TableHead>
                            <TableHead>Reviewer</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <For each={() => ROWS}>
                            {(row: (typeof ROWS)[number]) => (
                              <TableRow>
                                <TableCell>
                                  <Checkbox aria-label={`Select ${row.header}`} />
                                </TableCell>
                                <TableCell>{row.header}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{row.type}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={row.status === "Done" ? "secondary" : "outline"}>
                                    {row.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{row.target}</TableCell>
                                <TableCell>{row.limit}</TableCell>
                                <TableCell>{row.reviewer}</TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Actions for ${row.header}`}
                                      >
                                        <EllipsisVertical />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      items={ROW_ACTIONS}
                                      aria-label="Row actions"
                                    >
                                      {(action: (typeof ROW_ACTIONS)[number]) => (
                                        <DropdownMenuItem
                                          variant={
                                            action.id === "delete" ? "destructive" : "default"
                                          }
                                        >
                                          {action.name}
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            )}
                          </For>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div class={pager}>
              <span>0 of {String(ROWS.length)} row(s) selected.</span>
              <div class={pagerButtons}>
                <span>Rows per page</span>
                <Select
                  items={[
                    { id: "10", name: "10" },
                    { id: "20", name: "20" },
                    { id: "50", name: "50" },
                  ]}
                  defaultSelectedKey="10"
                  aria-label="Rows per page"
                >
                  {(entry: { id: string; name: string }) => <SelectItem>{entry.name}</SelectItem>}
                </Select>
                <span>Page {String(page())} of 5</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  isDisabled={page() === 1}
                  onPress={() => page.set(Math.max(1, page() - 1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  isDisabled={page() === 5}
                  onPress={() => page.set(Math.min(5, page() + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * The chart, in a component of its own.
 *
 * `ChartContainer` takes its config once and the series read it; putting the
 * call inline in the card would rebuild it on every range change, which is what
 * made the legend flicker.
 */
function CardContentChart(props: Incoming<{ data: typeof VISITORS }>) {
  return (
    <div class={padded}>
      <ChartContainer config={CHART_CONFIG} class={chartBox}>
        <ChartLines data={props.data()} x="date" area aria-label="Visitors" />
        <ChartLegend />
      </ChartContainer>
    </div>
  );
}
