/**
 * Benchmark utilities
 */

import type { BenchmarkResult } from "./types.ts";

/**
 * Run a benchmark function multiple times and collect stats
 */
export async function benchmark(
  name: string,
  framework: "zest" | "solid",
  operation: string,
  fn: () => void | Promise<void>,
  options: { iterations?: number; warmup?: number } = {}
): Promise<BenchmarkResult> {
  const { iterations = 1000, warmup = 100 } = options;

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Force GC if available
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }

  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const opsPerSecond = 1000 / avgMs;

  return {
    name,
    framework,
    operation,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSecond,
  };
}

/**
 * Generate random data for benchmarks
 */
export function generateItems(count: number): { id: number; name: string; value: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    value: Math.random() * 1000,
  }));
}

/**
 * Shuffle array in place
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
