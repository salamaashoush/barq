import type { SavedView } from "@barqjs/arc";

export type CheckState = "failing" | "degraded" | "passing" | "paused";
export type CheckKind = "api" | "browser" | "tcp" | "dns";

export interface Check {
  readonly id: string;
  readonly name: string;
  readonly kind: CheckKind;
  readonly state: CheckState;
  readonly locations: readonly string[];
  readonly latency: number;
  readonly runs: number;
  readonly cost: number;
  readonly note?: string;
  readonly editable: boolean;
}

export const CHECKS: readonly Check[] = [
  {
    id: "chk-checkout",
    name: "Checkout API",
    kind: "api",
    state: "failing",
    locations: ["Frankfurt", "Virginia", "Singapore", "São Paulo"],
    latency: 1840,
    runs: 2880,
    cost: 14.4,
    note: "Payments provider returns 502 since 08:12",
    editable: true,
  },
  {
    id: "chk-signin",
    name: "Sign in flow",
    kind: "browser",
    state: "degraded",
    locations: ["Frankfurt", "Virginia"],
    latency: 2410,
    runs: 1440,
    cost: 21.6,
    note: "Slow in Virginia only",
    editable: false,
  },
  {
    id: "chk-search",
    name: "Search suggestions",
    kind: "api",
    state: "passing",
    locations: ["Frankfurt"],
    latency: 212,
    runs: 2880,
    cost: 14.4,
    editable: true,
  },
  {
    id: "chk-status",
    name: "Status page",
    kind: "browser",
    state: "passing",
    locations: ["Frankfurt", "Virginia", "Singapore"],
    latency: 640,
    runs: 720,
    cost: 10.8,
    editable: true,
  },
  {
    id: "chk-mail",
    name: "Mail relay",
    kind: "tcp",
    state: "paused",
    locations: ["Frankfurt", "Virginia", "Singapore", "São Paulo", "Sydney"],
    latency: 0,
    runs: 0,
    cost: 0,
    note: "Paused during the provider migration",
    editable: true,
  },
  {
    id: "chk-dns",
    name: "Apex DNS",
    kind: "dns",
    state: "passing",
    locations: ["Virginia", "Sydney"],
    latency: 38,
    runs: 2880,
    cost: 2.9,
    editable: false,
  },
];

export interface CheckStateLook {
  readonly label: string;
  readonly tone: "danger" | "warning" | "success" | "neutral";
}

export const CHECK_STATE: Readonly<Record<CheckState, CheckStateLook>> = {
  failing: { label: "Failing", tone: "danger" },
  degraded: { label: "Degraded", tone: "warning" },
  passing: { label: "Passing", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
};

export const KIND_LABEL: Readonly<Record<CheckKind, string>> = {
  api: "API",
  browser: "Browser",
  tcp: "TCP",
  dns: "DNS",
};

export const TIME_ZONES: readonly string[] = [
  "Africa/Cairo",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Pacific/Auckland",
];

export const SAVED_VIEWS: readonly SavedView[] = [
  {
    id: "failing-api",
    name: "Failing APIs",
    state: { state: "failing", kind: "api" },
    mine: true,
  },
  {
    id: "browser",
    name: "Browser checks",
    state: { kind: "browser" },
    mine: true,
  },
  {
    id: "on-call",
    name: "On-call board",
    state: { state: "failing" },
    mine: false,
    shared: true,
  },
];

export interface Due {
  readonly id: string;
  readonly title: string;
  readonly course: string;
  readonly due: string;
}

export const DUE: readonly Due[] = [
  { id: "w1", title: "Essay draft", course: "English literature", due: "2026-11-24T15:00:00Z" },
  { id: "w2", title: "Lab report: titration", course: "Chemistry", due: "2026-11-24T21:00:00Z" },
  { id: "w3", title: "Reading: chapter 7", course: "History", due: "2026-11-23T08:00:00Z" },
  { id: "w4", title: "Quiz: vectors", course: "Mathematics", due: "2026-11-18T10:00:00Z" },
  { id: "w5", title: "Group presentation", course: "Economics", due: "2026-11-12T13:00:00Z" },
  { id: "w6", title: "Project proposal", course: "Computer science", due: "2026-10-28T09:00:00Z" },
];

export interface Route {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly severities: string;
}

export const PROJECT_ROUTES: readonly Route[] = [
  {
    id: "r1",
    name: "Checkout on-call",
    target: "PagerDuty: payments",
    severities: "Critical, high",
  },
  { id: "r2", name: "Web team chat", target: "Slack: #web-alerts", severities: "All" },
];

export const ORG_ROUTES: readonly Route[] = [
  {
    id: "o1",
    name: "Security desk",
    target: "Email: security@example.com",
    severities: "Critical",
  },
  { id: "o2", name: "Ops escalation", target: "Opsgenie: platform", severities: "Critical, high" },
];
