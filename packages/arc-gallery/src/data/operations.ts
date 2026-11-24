/** The moment relative times are measured from, so the server and the page write the same words. */
export const NOW = "2026-11-24T09:00:00Z";

export type InvoiceStatus = "paid" | "open" | "overdue" | "draft";

export interface Invoice {
  readonly id: string;
  readonly number: string;
  readonly customer: string;
  readonly email: string;
  readonly region: string;
  readonly status: InvoiceStatus;
  readonly amount: number;
  readonly issued: string;
}

const CUSTOMERS = [
  ["Northwind Traders", "billing@northwind.example.com"],
  ["Globex", "accounts@globex.example.com"],
  ["Initech", "finance@initech.example.com"],
  ["Umbrella Labs", "ap@umbrella.example.com"],
  ["Hooli", "payables@hooli.example.com"],
  ["Stark Logistics", "invoices@stark.example.com"],
  ["Wayne Freight", "ops@wayne.example.com"],
  ["Soylent Foods", "billing@soylent.example.com"],
  ["Vandelay Imports", "art@vandelay.example.com"],
  ["Tyrell Systems", "finance@tyrell.example.com"],
] as const;

const REGIONS = ["Europe", "North America", "Middle East", "Asia Pacific"];
const STATUSES: readonly InvoiceStatus[] = [
  "paid",
  "open",
  "paid",
  "overdue",
  "paid",
  "draft",
  "open",
];

/** Thirty-two of Acme's invoices, the same on every run. */
export const INVOICES: readonly Invoice[] = Array.from({ length: 32 }, (_, index) => {
  const [customer, email] = CUSTOMERS[index % CUSTOMERS.length] ?? CUSTOMERS[0];
  const day = 1 + ((index * 5) % 28);
  return {
    id: `inv-${1040 + index}`,
    number: `INV-${1040 + index}`,
    customer,
    email,
    region: REGIONS[(index * 3) % REGIONS.length] ?? "Europe",
    status: STATUSES[index % STATUSES.length] ?? "paid",
    amount: 180 + ((index * 7919) % 9400) + (index % 4) * 0.5,
    issued: `2026-${index < 16 ? "10" : "11"}-${String(day).padStart(2, "0")}`,
  };
});

export interface StatusDisplay {
  label: string;
  tone: "success" | "info" | "danger" | "neutral";
}

export const INVOICE_STATUS: Readonly<Record<InvoiceStatus, StatusDisplay>> = {
  paid: { label: "Paid", tone: "success" },
  open: { label: "Open", tone: "info" },
  overdue: { label: "Overdue", tone: "danger" },
  draft: { label: "Draft", tone: "neutral" },
};

/** Fourteen days of the API's traffic, oldest first. */
export const DAYS = [
  { day: "Nov 11", requests: 182, errors: 2.1, latency: 212 },
  { day: "Nov 12", requests: 196, errors: 1.8, latency: 204 },
  { day: "Nov 13", requests: 205, errors: 1.6, latency: 198 },
  { day: "Nov 14", requests: 188, errors: 2.4, latency: 231 },
  { day: "Nov 15", requests: 142, errors: 1.2, latency: 176 },
  { day: "Nov 16", requests: 131, errors: 1.1, latency: 169 },
  { day: "Nov 17", requests: 214, errors: 1.9, latency: 207 },
  { day: "Nov 18", requests: 228, errors: 3.6, latency: 268 },
  { day: "Nov 19", requests: 236, errors: 2.2, latency: 221 },
  { day: "Nov 20", requests: 241, errors: 1.7, latency: 201 },
  { day: "Nov 21", requests: 233, errors: 1.5, latency: 194 },
  { day: "Nov 22", requests: 160, errors: 1.0, latency: 172 },
  { day: "Nov 23", requests: 152, errors: 0.9, latency: 168 },
  { day: "Nov 24", requests: 249, errors: 1.4, latency: 189 },
] as const;

export interface Activity {
  readonly id: string;
  readonly who: string;
  readonly what: string;
  readonly detail?: string;
  readonly at: string;
  readonly tone: "success" | "warning" | "danger" | "info" | "neutral";
}

export const ACTIVITY: readonly Activity[] = [
  {
    id: "a1",
    who: "Salama",
    what: "Deployed api v2.4.1 to production",
    detail: "Rolled out to eu-west-1 and us-east-1 in 6 minutes.",
    at: "2026-11-24T08:52:00Z",
    tone: "success",
  },
  {
    id: "a2",
    who: "Lina",
    what: "Resolved the checkout latency incident",
    detail: "A slow query on the orders table, now indexed.",
    at: "2026-11-24T07:40:00Z",
    tone: "info",
  },
  {
    id: "a3",
    who: "Omar",
    what: "Raised the error budget alert for payments",
    at: "2026-11-24T05:15:00Z",
    tone: "warning",
  },
  {
    id: "a4",
    who: "Maya",
    what: "Marked INV-1043 as overdue",
    detail: "Third reminder sent to accounts@globex.example.com.",
    at: "2026-11-23T16:20:00Z",
    tone: "danger",
  },
  {
    id: "a5",
    who: "Jonas",
    what: "Invited two people to the Support team",
    at: "2026-11-22T11:05:00Z",
    tone: "neutral",
  },
];
