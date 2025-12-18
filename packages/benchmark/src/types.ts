/**
 * Benchmark types and utilities
 */

export interface BenchmarkResult {
  name: string;
  framework: "barq" | "solid";
  operation: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
}

export interface BenchmarkSuite {
  name: string;
  run: () => Promise<BenchmarkResult[]>;
}

export function formatResult(result: BenchmarkResult): string {
  return [
    `${result.framework.padEnd(6)} | ${result.operation.padEnd(25)} |`,
    `${result.avgMs.toFixed(3).padStart(10)} ms avg |`,
    `${result.opsPerSecond.toFixed(0).padStart(10)} ops/s |`,
    `${result.iterations} iterations`,
  ].join(" ");
}

export function formatComparison(barq: BenchmarkResult, solid: BenchmarkResult): string {
  const ratio = solid.avgMs / barq.avgMs;
  const faster = ratio > 1 ? "barq" : "solid";
  const diff = Math.abs(ratio - 1) * 100;

  return `${barq.operation}: ${faster} is ${diff.toFixed(1)}% faster (barq: ${barq.avgMs.toFixed(3)}ms, solid: ${solid.avgMs.toFixed(3)}ms)`;
}
