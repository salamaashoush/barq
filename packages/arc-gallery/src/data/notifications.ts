import type { NotificationItem } from "@barqjs/arc";
import { Receipt } from "@barqjs/lucide/icons/receipt";
import { Rocket } from "@barqjs/lucide/icons/rocket";
import { ShieldCheck } from "@barqjs/lucide/icons/shield-check";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Acme's recent notifications, timed back from `now` so today and yesterday stay today and yesterday. */
export function recentNotifications(now: number): NotificationItem[] {
  function at(ago: number): string {
    return new Date(now - ago).toISOString();
  }
  return [
    {
      id: "n-1",
      title: "Lina requested your review",
      body: "Billing revamp: move invoice totals to the ledger service.",
      actor: { name: "Lina" },
      source: "Pull requests",
      createdAt: at(4 * MINUTE),
    },
    {
      id: "n-2",
      title: "Error rate above 2%",
      body: "checkout-service failed 2.4% of requests for five minutes.",
      icon: TriangleAlert,
      tone: "danger",
      source: "Monitoring",
      createdAt: at(26 * MINUTE),
    },
    {
      id: "n-3",
      title: "Omar mentioned you",
      body: '"@Salama can you confirm the SSO rollout date for Acme Enterprise?"',
      actor: { name: "Omar" },
      source: "Comments",
      createdAt: at(2 * HOUR),
    },
    {
      id: "n-4",
      title: "Deploy finished",
      body: "api-gateway v2.4.0 is live in eu-west-1.",
      icon: Rocket,
      tone: "success",
      source: "Deploys",
      createdAt: at(DAY + 3 * HOUR),
      read: true,
    },
    {
      id: "n-5",
      title: "Invoice #1042 is overdue",
      body: "Acme Logistics, $3,180.00, due 14 days ago.",
      icon: Receipt,
      tone: "warning",
      source: "Billing",
      createdAt: at(DAY + 6 * HOUR),
    },
    {
      id: "n-6",
      title: 'Maya merged "Design tokens for dark mode"',
      actor: { name: "Maya" },
      source: "Pull requests",
      createdAt: at(3 * DAY),
      read: true,
    },
    {
      id: "n-7",
      title: "Two-factor turned on for Jonas",
      icon: ShieldCheck,
      tone: "success",
      source: "Security",
      createdAt: at(5 * DAY),
      read: true,
    },
  ];
}
