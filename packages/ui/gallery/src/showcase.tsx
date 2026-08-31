/**
 * The composed page shadcn's `/create` shows first.
 *
 * A gallery is a list of parts, which answers "does this component work". This
 * answers the other question, and it is the one somebody choosing a theme is
 * actually asking: does the whole thing hold together in one colour, one radius
 * and one typeface. shadcn shows a composed screen for the same reason, and
 * switches to the parts on demand.
 */

import { css } from "@barqjs/css";
import {
  Avatar,
  AvatarFallback,
  Badge,
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
  ChartLines,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Label,
  Progress,
  Separator,
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
} from "@barqjs/ui";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";

const page = css`
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  grid-template-columns: 1fr;
  align-content: start;

  @media (width >= 64rem) {
    grid-template-columns: 2fr 1fr;
  }
`;

const stack = css`
  display: grid;
  gap: 1rem;
  align-content: start;
  min-width: 0;
`;

const stats = css`
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
`;

const figure = css`
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
`;

const trend = css`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

const row = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const SHAPES = [
  { id: "bars", name: "Bars" },
  { id: "area", name: "Area" },
];

const CONFIG = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
  { key: "tablet", label: "Tablet", color: "var(--chart-3)" },
];

const DATA = [
  { month: "Jan", desktop: 186, mobile: 80, tablet: 45 },
  { month: "Feb", desktop: 305, mobile: 200, tablet: 92 },
  { month: "Mar", desktop: 237, mobile: 120, tablet: 61 },
  { month: "Apr", desktop: 273, mobile: 190, tablet: 78 },
  { month: "May", desktop: 209, mobile: 130, tablet: 55 },
  { month: "Jun", desktop: 314, mobile: 240, tablet: 101 },
];

const INVOICES = [
  { id: "INV-001", who: "Aurora Labs", status: "Paid", amount: "$2,400.00" },
  { id: "INV-002", who: "Meridian", status: "Pending", amount: "$1,150.00" },
  { id: "INV-003", who: "Northwind", status: "Overdue", amount: "$860.00" },
];

const PEOPLE = [
  { name: "Ada Lovelace", role: "Owner", initials: "AL" },
  { name: "Grace Hopper", role: "Admin", initials: "GH" },
  { name: "Alan Turing", role: "Member", initials: "AT" },
];

export function Showcase() {
  return (
    <div class={page}>
      <div class={stack}>
        <div class={stats}>
          <Card>
            <CardHeader>
              <CardDescription>Revenue</CardDescription>
              <CardTitle class={figure}>$45,231</CardTitle>
              <CardAction>
                <Badge variant="secondary">
                  <TrendingUp />
                  +12.5%
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter>
              <span class={trend}>Up from $40,200 last month</span>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Customers</CardDescription>
              <CardTitle class={figure}>2,340</CardTitle>
              <CardAction>
                <Badge variant="outline">+180</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter>
              <span class={trend}>Growth is steady</span>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Active now</CardDescription>
              <CardTitle class={figure}>573</CardTitle>
              <CardAction>
                <Badge variant="destructive">-2%</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter>
              <span class={trend}>Down slightly on yesterday</span>
            </CardFooter>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Visitors</CardTitle>
            <CardDescription>Six months, by device.</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm">
                Export
                <ArrowUpRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Tabs items={SHAPES}>
              <TabsList aria-label="Chart shape">
                {(shape: (typeof SHAPES)[number]) => <TabsTrigger>{shape.name}</TabsTrigger>}
              </TabsList>
              <TabsContent>
                {(shape: (typeof SHAPES)[number]) => (
                  <ChartContainer config={CONFIG}>
                    {shape.id === "bars" ? (
                      <ChartBars data={DATA} x="month" aria-label="Visitors by month" />
                    ) : (
                      <ChartLines data={DATA} x="month" area aria-label="Visitors by month" />
                    )}
                    <ChartLegend />
                  </ChartContainer>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Everything billed this quarter.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {INVOICES.map((invoice) => (
                  <TableRow>
                    <TableCell>{invoice.id}</TableCell>
                    <TableCell>{invoice.who}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === "Paid"
                            ? "secondary"
                            : invoice.status === "Overdue"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{invoice.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div class={stack}>
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They will get an email straight away.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel for="invite-email">Email</FieldLabel>
              <Input id="invite-email" type="email" placeholder="you@example.com" />
              <FieldDescription>We never share it.</FieldDescription>
            </Field>
            <div class={row} style={{ "margin-top": "0.75rem" }}>
              <Checkbox id="invite-admin" />
              <Label for="invite-admin">Make them an admin</Label>
            </div>
          </CardContent>
          <CardFooter>
            <Button>Send invite</Button>
            <Button variant="ghost">Cancel</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {PEOPLE.map((person) => (
                <Item>
                  <ItemMedia>
                    <Avatar>
                      <AvatarFallback>{person.initials}</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{person.name}</ItemTitle>
                    <ItemDescription>{person.role}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>7.2 GB of 10 GB used.</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={72} label="Storage used" />
            <Separator style={{ "margin-block": "0.875rem" }} />
            <div class={row}>
              <Inbox />
              <span style={{ "font-size": "0.875rem" }}>Archive is 4.1 GB of it</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
