/**
 * The composed application shadcn's `/create` shows first.
 *
 * A gallery is a list of parts, which answers "does this component work". This
 * answers the other question, and it is the one somebody choosing a theme is
 * actually asking: does the whole thing hold together in one colour, one radius
 * and one typeface.
 *
 * DENSITY IS THE POINT, which is why this is a masonry of fifteen blocks rather
 * than a tidy grid of four. Upstream's preview is a whole product screen, and
 * the reason is measurable: with the old sparse page loaded, 875 of a style's
 * 1,330 rules matched no element at all, so most of a style could not be seen
 * and could not be checked. `tools/sweep.js` counts that, and it is the number
 * to watch when adding to this file.
 *
 * CSS `columns` rather than a grid, because a masonry is what upstream lays
 * out: every card takes the height its content needs and the columns fill
 * unevenly. `break-inside: avoid` is what keeps a card whole.
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChartBars,
  ChartContainer,
  ChartLegend,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Label,
  Progress,
  Select,
  SelectItem,
  Separator,
  Slider,
  Switch,
  Textarea,
} from "@barqjs/ui";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { Coffee } from "@barqjs/lucide/icons/coffee";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Film } from "@barqjs/lucide/icons/film";
import { Plus } from "@barqjs/lucide/icons/plus";
import { ShoppingCart } from "@barqjs/lucide/icons/shopping-cart";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";
import { Truck } from "@barqjs/lucide/icons/truck";

/*
 * `@container`, not `@media`, and this is what upstream's iframe was buying.
 *
 * A media query asks the WINDOW how wide it is, and this page is not the
 * window: it is 1,304px of preview inside a 1,600px viewport. Asking the window
 * gave four columns to a container that had room for three, and the fourth ran
 * off the right edge with a select and a date cut in half. Upstream never meets
 * this because their preview is an iframe, whose viewport IS its width.
 *
 * The preview declares the container; these ask it. The breakpoints are the
 * same numbers a media query would use, because they are about how much room
 * there is and that has not changed — only what is being asked.
 */
const page = css`
  padding: 1rem;
  columns: 1;
  column-gap: 1rem;

  @container preview (width >= 48rem) {
    columns: 2;
  }
  @container preview (width >= 80rem) {
    columns: 3;
  }
  @container preview (width >= 110rem) {
    columns: 4;
  }
`;

/** A card in the masonry: whole, and with the gap below it that `columns` cannot give. */
const block = css`
  break-inside: avoid;
  margin-bottom: 1rem;
`;

const stack = css`
  display: grid;
  gap: 0.75rem;
  min-width: 0;
`;

const row = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
`;

const pair = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
`;

const figure = css`
  font-size: 1.875rem;
  letter-spacing: -0.02em;
`;

const small = css`
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

const amount = css`
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const positive = css`
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--chart-2);
`;

/** A tile inside a card: a nested surface, which is what a target or a balance is. */
const tile = css`
  display: grid;
  gap: 0.375rem;
  border-radius: var(--radius);
  background: var(--muted);
  padding: 0.75rem;
  min-width: 0;
`;

const label = css`
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
`;

/** A year of activity, as bars. Twelve is what makes it read as a year. */
const spark = css`
  display: flex;
  align-items: flex-end;
  gap: 0.25rem;
  height: 3rem;
`;

const bar = css`
  flex: 1;
  border-radius: 2px;
  background: var(--chart-1);
  min-width: 0;
`;

const nav = css`
  display: grid;
  gap: 0.125rem;
`;

const navGroup = css`
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  padding: 0.5rem 0.5rem 0.25rem;
`;

const navItem = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--radius);
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  color: var(--foreground);

  &[data-current="true"] {
    background: var(--accent);
    color: var(--accent-foreground);
  }
`;

const CHART_CONFIG = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
];

const CHART_DATA = [
  { month: "Dec", desktop: 186, mobile: 80 },
  { month: "Jan", desktop: 305, mobile: 200 },
  { month: "Feb", desktop: 237, mobile: 120 },
  { month: "Mar", desktop: 273, mobile: 190 },
  { month: "Apr", desktop: 209, mobile: 130 },
  { month: "May", desktop: 314, mobile: 240 },
];

const CURRENCIES = [
  { id: "usd", name: "USD — United States Dollar" },
  { id: "eur", name: "EUR — Euro" },
  { id: "gbp", name: "GBP — Pound Sterling" },
];

const ORDERS = [
  { id: "market", name: "Market Order" },
  { id: "limit", name: "Limit Order" },
  { id: "stop", name: "Stop Order" },
];

const ACCOUNTS = [
  { id: "checking", name: "Main Checking (··8402) — $12,450.00" },
  { id: "savings", name: "High Yield Savings (··1192) — $42,100.00" },
];

const TRANSACTIONS = [
  {
    id: "coffee",
    name: "Blue Bottle Coffee",
    kind: "Food & Drink",
    when: "Today, 10:24",
    value: "-$6.50",
    up: false,
    icon: Coffee,
  },
  {
    id: "groceries",
    name: "Whole Foods Market",
    kind: "Groceries",
    when: "Yesterday",
    value: "-$142.30",
    up: false,
    icon: ShoppingCart,
  },
  {
    id: "payout",
    name: "Stripe Payout",
    kind: "Income",
    when: "Oct 12",
    value: "+$4,200.00",
    up: true,
    icon: CreditCard,
  },
  {
    id: "ride",
    name: "Uber Technologies",
    kind: "Transport",
    when: "Oct 11",
    value: "-$24.10",
    up: false,
    icon: Truck,
  },
  {
    id: "netflix",
    name: "Netflix Subscription",
    kind: "Entertainment",
    when: "Oct 10",
    value: "-$19.99",
    up: false,
    icon: Film,
  },
];

const YEAR = [42, 58, 31, 74, 66, 88, 51, 63, 79, 45, 92, 70];

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const NAV = [
  {
    id: "overview",
    name: "Overview",
    items: [
      { id: "dashboard", name: "Dashboard", current: true },
      { id: "transactions", name: "Transactions" },
      { id: "investments", name: "Investments" },
    ],
  },
  {
    id: "account",
    name: "Account",
    items: [
      { id: "profile", name: "Profile" },
      { id: "billing", name: "Billing" },
      { id: "security", name: "Security" },
    ],
  },
];

const TEAM = [
  { id: "ada", who: "AL", name: "Ada Lovelace", role: "Owner" },
  { id: "grace", who: "GH", name: "Grace Hopper", role: "Admin" },
  { id: "alan", who: "AT", name: "Alan Turing", role: "Member" },
];

export function Showcase() {
  return (
    <div class={page} data-slot="showcase">
      <Card class={block}>
        <CardHeader>
          <CardTitle>Contribution History</CardTitle>
          <CardDescription>Last 6 months of activity</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={CHART_CONFIG}>
            <ChartBars data={CHART_DATA} x="month" aria-label="Contributions by month" />
            <ChartLegend />
          </ChartContainer>
          <div class={pair} style={{ "margin-top": "0.75rem" }}>
            <div class={tile}>
              <span class={label}>Upcoming</span>
              <strong>May 25, 2024</strong>
              <span class={small}>$1,000 scheduled</span>
            </div>
            <div class={tile}>
              <span class={label}>Auto-save plan</span>
              <strong>Accelerated</strong>
              <span class={small}>Recurring weekly</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" style={{ width: "100%" }}>
            View Full Report
          </Button>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader bordered>
          <CardTitle>Payout Threshold</CardTitle>
          <CardDescription>
            Set the minimum balance required before a payout is triggered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <Field>
              <FieldLabel for="currency">Preferred Currency</FieldLabel>
              <Select
                items={CURRENCIES}
                id="currency"
                aria-label="Preferred currency"
                defaultSelectedKey="usd"
              >
                {(entry: (typeof CURRENCIES)[number]) => <SelectItem>{entry.name}</SelectItem>}
              </Select>
            </Field>
            <div class={row}>
              <span class={small}>Minimum Payout Amount</span>
              <strong class={figure} style={{ "font-size": "1.25rem" }}>
                $2500.00
              </strong>
            </div>
            <Slider aria-label="Minimum payout amount" defaultValue={25} />
            <div class={row}>
              <span class={small}>$50 (MIN)</span>
              <span class={small}>$10,000 (MAX)</span>
            </div>
            <Field>
              <FieldLabel for="notes">Notes</FieldLabel>
              <Textarea id="notes" placeholder="Add any notes for this payout configuration…" />
            </Field>
          </div>
        </CardContent>
        <CardFooter>
          <Button style={{ width: "100%" }}>Save Threshold</Button>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Savings Targets</CardTitle>
          <CardDescription>Active milestones for 2024</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline">
              New Goal
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <div class={tile}>
              <span class={label}>Retirement</span>
              <strong class={figure}>$420,000</strong>
              <Progress value={65} label="Retirement" />
              <div class={row}>
                <span class={small}>65% achieved</span>
                <span class={small}>$273,000</span>
              </div>
            </div>
            <div class={tile}>
              <span class={label}>Real Estate</span>
              <strong class={figure}>$85,000</strong>
              <Progress value={32} label="Real estate" />
              <div class={row}>
                <span class={small}>32% achieved</span>
                <span class={small}>$27,200</span>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter bordered>
          <span class={small}>You have not met your targets for this year.</span>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Buy Investment</CardTitle>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <Field>
              <FieldLabel for="invest">Amount to Invest</FieldLabel>
              <Input id="invest" value="$ 1,000.00" />
            </Field>
            <Field>
              <FieldLabel for="order">Order Type</FieldLabel>
              <Select items={ORDERS} id="order" aria-label="Order type" defaultSelectedKey="market">
                {(entry: (typeof ORDERS)[number]) => <SelectItem>{entry.name}</SelectItem>}
              </Select>
              <FieldDescription>Market orders execute at the current price.</FieldDescription>
            </Field>
            <Separator />
            <div class={row}>
              <span class={small}>Estimated Shares</span>
              <span class={amount}>1.95</span>
            </div>
            <div class={row}>
              <span class={small}>Buying Power</span>
              <span class={amount}>$12,450.00</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" style={{ width: "100%" }}>
            Review Order
          </Button>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Account Access</CardTitle>
          <CardDescription>Update your credentials or re-authenticate.</CardDescription>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <Field>
              <FieldLabel for="email">Email Address</FieldLabel>
              <Input id="email" type="email" value="artist@studio.inc" />
            </Field>
            <Field>
              <FieldLabel for="password">Current Password</FieldLabel>
              <Input id="password" type="password" value="hunter2hunter2" />
            </Field>
            <Button variant="outline" style={{ width: "100%" }}>
              Update Security
            </Button>
            <Item variant="outline">
              <ItemMedia variant="icon">
                <TriangleAlert />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Danger Zone</ItemTitle>
                <ItemDescription>Archive account and remove catalog</ItemDescription>
              </ItemContent>
              <ArrowRight />
            </Item>
          </div>
        </CardContent>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardDescription>Claimable Balance</CardDescription>
          <CardTitle class={figure}>$0.00</CardTitle>
          <CardAction>
            <Badge variant="secondary">Pending Setup</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <div class={row}>
              <span class={small}>Net Royalties</span>
              <span class={amount}>$0.00</span>
            </div>
            <div class={row}>
              <span class={small}>Processing Fee</span>
              <span class={amount}>-$0.00</span>
            </div>
            <Separator />
            <div class={row}>
              <span class={small}>Total Ready to Claim</span>
              <span class={amount}>$0.00 USD</span>
            </div>
          </div>
        </CardContent>
        <CardFooter bordered>
          <span class={small}>
            Once your bank is connected, balances over $10.00 are automatically eligible for monthly
            distribution on the 15th of each month.
          </span>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Your latest account activity.</CardDescription>
          <CardAction>
            <Button size="sm" variant="ghost">
              View All
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            <For each={() => TRANSACTIONS}>
              {(entry: (typeof TRANSACTIONS)[number]) => (
                <>
                  <Item>
                    <ItemMedia variant="icon">
                      <entry.icon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{entry.name}</ItemTitle>
                      <ItemDescription>{entry.kind}</ItemDescription>
                    </ItemContent>
                    <span class={small}>{entry.when}</span>
                    <span class={entry.up ? positive : amount}>{entry.value}</span>
                  </Item>
                  <ItemSeparator />
                </>
              )}
            </For>
          </ItemGroup>
        </CardContent>
      </Card>

      <div class={block}>
        <div class={pair}>
          <Card>
            <CardHeader>
              <CardDescription>Card Balance</CardDescription>
              <CardTitle class={figure} style={{ "font-size": "1.25rem" }}>
                US$12.94
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span class={small}>US$11,337.06 Available</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Payment Due</CardDescription>
              <CardTitle class={figure} style={{ "font-size": "1.25rem" }}>
                1 Apr
              </CardTitle>
            </CardHeader>
            <CardFooter>
              <Button size="sm" variant="outline" style={{ width: "100%" }}>
                Pay Early
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Yearly Activity</CardTitle>
          <CardAction>
            <Badge variant="outline">
              <TrendingUp />
              +US$0.25 Daily Cash
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div class={spark} aria-hidden="true">
            <For each={() => YEAR}>
              {(height: number) => <span class={bar} style={{ height: `${height}%` }} />}
            </For>
          </div>
          <div class={row} style={{ "margin-top": "0.5rem" }}>
            <For each={() => MONTHS}>{(month: string) => <span class={small}>{month}</span>}</For>
          </div>
        </CardContent>
      </Card>

      <Card class={block}>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Plus />
              </EmptyMedia>
              <EmptyTitle>Distribute Track</EmptyTitle>
              <EmptyDescription>
                Upload your first master to start reaching listeners on Spotify, Apple Music, and
                more.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm">Create Release</Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>

      <Card class={block}>
        <CardHeader bordered>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Manage your account settings and notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <Field>
              <FieldLabel for="default-currency">Default Currency</FieldLabel>
              <Select
                items={CURRENCIES}
                id="default-currency"
                aria-label="Default currency"
                defaultSelectedKey="usd"
              >
                {(entry: (typeof CURRENCIES)[number]) => <SelectItem>{entry.name}</SelectItem>}
              </Select>
            </Field>
            <div class={row}>
              <div>
                <Label for="public-stats">Public Statistics</Label>
                <p class={small} style={{ margin: "0.125rem 0 0" }}>
                  Allow others to see your total stream count.
                </p>
              </div>
              <Switch id="public-stats" defaultSelected aria-label="Public statistics" />
            </div>
            <div class={row}>
              <div>
                <Label for="digest">Weekly Digest</Label>
                <p class={small} style={{ margin: "0.125rem 0 0" }}>
                  A summary every Monday morning.
                </p>
              </div>
              <Switch id="digest" aria-label="Weekly digest" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class={block}>
        <CardContent>
          <div class={nav}>
            <For each={() => NAV}>
              {(group: (typeof NAV)[number]) => (
                <>
                  <div class={navGroup}>{group.name}</div>
                  <For each={() => group.items}>
                    {(entry: { id: string; name: string; current?: boolean }) => (
                      <a
                        class={navItem}
                        href="#"
                        data-current={entry.current === true ? "true" : "false"}
                      >
                        {entry.name}
                      </a>
                    )}
                  </For>
                </>
              )}
            </For>
          </div>
        </CardContent>
      </Card>

      <Card class={block}>
        <CardHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Payments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Change transfer limit</ItemTitle>
                <ItemDescription>Adjust how much you can send from your balance.</ItemDescription>
              </ItemContent>
              <ArrowRight />
            </Item>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Scheduled transfers</ItemTitle>
                <ItemDescription>Set up a transfer to send at a later date.</ItemDescription>
              </ItemContent>
              <ArrowRight />
            </Item>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Direct Debits</ItemTitle>
                <ItemDescription>Two active mandates.</ItemDescription>
              </ItemContent>
              <ArrowRight />
            </Item>
          </ItemGroup>
        </CardContent>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Transfer Funds</CardTitle>
          <CardDescription>Move money between your connected accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <Field>
              <FieldLabel for="transfer">Amount to Transfer</FieldLabel>
              <Input id="transfer" value="$ 1,200.00" />
            </Field>
            <Field>
              <FieldLabel for="from">From Account</FieldLabel>
              <Select
                items={ACCOUNTS}
                id="from"
                aria-label="From account"
                defaultSelectedKey="checking"
              >
                {(entry: (typeof ACCOUNTS)[number]) => <SelectItem>{entry.name}</SelectItem>}
              </Select>
            </Field>
            <Field>
              <FieldLabel for="to">To Account</FieldLabel>
              <Select items={ACCOUNTS} id="to" aria-label="To account" defaultSelectedKey="savings">
                {(entry: (typeof ACCOUNTS)[number]) => <SelectItem>{entry.name}</SelectItem>}
              </Select>
            </Field>
            <Separator />
            <div class={row}>
              <span class={small}>Estimated arrival</span>
              <span class={amount}>Today, Apr 14</span>
            </div>
            <div class={row}>
              <span class={small}>Transaction fee</span>
              <span class={amount}>$0.00</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button style={{ width: "100%" }}>
            Transfer
            <ArrowUpRight />
          </Button>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Everyone with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            <For each={() => TEAM}>
              {(person: (typeof TEAM)[number]) => (
                <Item>
                  <ItemMedia>
                    <Avatar>
                      <AvatarFallback>{person.who}</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{person.name}</ItemTitle>
                    <ItemDescription>{person.role}</ItemDescription>
                  </ItemContent>
                </Item>
              )}
            </For>
          </ItemGroup>
        </CardContent>
        <CardFooter bordered>
          <Button size="sm" variant="outline" style={{ width: "100%" }}>
            Invite a teammate
          </Button>
        </CardFooter>
      </Card>

      <Card class={block}>
        <CardHeader>
          <CardTitle>Power Usage</CardTitle>
          <CardDescription>Whole home</CardDescription>
        </CardHeader>
        <CardContent>
          <div class={stack}>
            <div>
              <span class={label}>Currently using</span>
              <div class={figure}>3.4 kW</div>
            </div>
            <div>
              <span class={label}>Battery level</span>
              <Progress value={78} label="Battery level" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
