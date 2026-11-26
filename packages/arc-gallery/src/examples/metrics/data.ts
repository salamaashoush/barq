import type { UptimeCell } from "@barqjs/arc";

/** Ninety days of a service's uptime, newest last, with two rough days. */
export function ninetyDays(seed: number): UptimeCell[] {
  const start = Date.UTC(2026, 7, 29);
  return Array.from({ length: 90 }, (_, at) => {
    const day = new Date(start + at * 86_400_000);
    const label = day.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const roll = (Math.sin((at + 1) * seed) + 1) / 2;
    if (at === 17 + seed)
      return { key: String(at), label, value: 96.4, notes: ["Checkout slow in eu-west"] };
    if (at === 61)
      return {
        key: String(at),
        label,
        value: 88.2,
        notes: ["Database failover", "Status report posted"],
      };
    if (at < 3) return { key: String(at), label, value: null };
    return { key: String(at), label, value: roll > 0.97 ? 99.95 : 100 };
  });
}

export interface LatencyBucket {
  readonly [field: string]: string | number;
  hour: string;
  p50: number;
  p95: number;
  outcome: string;
}

export const LATENCY: readonly LatencyBucket[] = [
  { hour: "08:00", p50: 182, p95: 410, outcome: "passed" },
  { hour: "09:00", p50: 190, p95: 455, outcome: "passed" },
  { hour: "10:00", p50: 240, p95: 980, outcome: "failed" },
  { hour: "11:00", p50: 205, p95: 520, outcome: "passed" },
  { hour: "12:00", p50: 176, p95: 430, outcome: "passed" },
  { hour: "13:00", p50: 260, p95: 1120, outcome: "failed" },
  { hour: "14:00", p50: 188, p95: 470, outcome: "passed" },
  { hour: "15:00", p50: 172, p95: 402, outcome: "passed" },
];

export interface RunsDay {
  readonly [field: string]: string | number;
  day: string;
  passed: number;
  degraded: number;
  failed: number;
}

export const RUNS: readonly RunsDay[] = [
  { day: "Mon", passed: 1210, degraded: 40, failed: 12 },
  { day: "Tue", passed: 1302, degraded: 22, failed: 8 },
  { day: "Wed", passed: 1188, degraded: 61, failed: 30 },
  { day: "Thu", passed: 1276, degraded: 18, failed: 4 },
  { day: "Fri", passed: 1340, degraded: 25, failed: 9 },
  { day: "Sat", passed: 620, degraded: 6, failed: 2 },
  { day: "Sun", passed: 598, degraded: 4, failed: 1 },
];

export interface ReadingWeek {
  readonly [field: string]: string | number;
  week: string;
  words: number;
  norm: number;
}

export const READING: readonly ReadingWeek[] = [
  { week: "W1", words: 62, norm: 70 },
  { week: "W2", words: 66, norm: 72 },
  { week: "W3", words: 71, norm: 74 },
  { week: "W4", words: 69, norm: 76 },
  { week: "W5", words: 78, norm: 78 },
  { week: "W6", words: 84, norm: 80 },
];
