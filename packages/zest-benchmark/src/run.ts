/**
 * Benchmark Runner
 * Runs signal/reactivity benchmarks comparing zest and solid-js
 *
 * Note: DOM-related benchmarks are skipped due to solid-js server/client detection
 * Signal benchmarks are the core comparison as both frameworks use fine-grained reactivity
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Setup DOM environment
GlobalRegistrator.register();

import { runSignalBenchmarks } from "./benchmarks/signals.ts";
import type { BenchmarkResult } from "./types.ts";
import { formatComparison, formatResult } from "./types.ts";

async function main() {
  console.log("=".repeat(80));
  console.log("ZEST vs SOLID-JS BENCHMARK - Signals/Reactivity");
  console.log("=".repeat(80));
  console.log();
  console.log("Both frameworks use fine-grained reactivity.");
  console.log("This benchmark compares the core signal primitives.");
  console.log();

  const allResults: BenchmarkResult[] = [];

  // Run signal benchmarks only (these work correctly in Node/Bun)
  console.log("-".repeat(80));
  console.log("Running: Signals/Reactivity");
  console.log("-".repeat(80));

  try {
    const results = await runSignalBenchmarks();
    allResults.push(...results);

    // Print results
    for (const result of results) {
      console.log(formatResult(result));
    }
    console.log();
  } catch (error) {
    console.error("Error running benchmarks:", error);
  }

  // Print comparisons
  console.log("=".repeat(80));
  console.log("COMPARISON SUMMARY");
  console.log("=".repeat(80));
  console.log();

  // Group by operation
  const operations = new Map<string, { zest?: BenchmarkResult; solid?: BenchmarkResult }>();

  for (const result of allResults) {
    const key = `${result.name}:${result.operation}`;
    if (!operations.has(key)) {
      operations.set(key, {});
    }
    const op = operations.get(key);
    if (op) {
      op[result.framework] = result;
    }
  }

  // Calculate wins
  let zestWins = 0;
  let solidWins = 0;
  let ties = 0;

  for (const [, { zest, solid }] of operations) {
    if (zest && solid) {
      const ratio = solid.avgMs / zest.avgMs;
      if (Math.abs(ratio - 1) < 0.05) {
        ties++;
        console.log(`  TIE: ${zest.operation} (within 5%)`);
      } else if (ratio > 1) {
        zestWins++;
        console.log(`  ZEST wins: ${formatComparison(zest, solid)}`);
      } else {
        solidWins++;
        console.log(`  SOLID wins: ${formatComparison(zest, solid)}`);
      }
    }
  }

  console.log();
  console.log("-".repeat(80));
  console.log(`FINAL SCORE: Zest wins ${zestWins}, Solid wins ${solidWins}, Ties ${ties}`);
  console.log("-".repeat(80));

  // Output JSON results
  const jsonPath = "./benchmark-results.json";
  await Bun.write(jsonPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to ${jsonPath}`);
}

main().catch(console.error);
