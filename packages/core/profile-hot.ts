/**
 * Micro-profile of the hot reactive paths, phase by phase.
 * Run: bun run profile-hot.ts
 */
import { batch, computed, scope, effect, signal } from "./src/signals.ts";

const N = 20000;

function bench(name: string, fn: () => void): void {
  // warmup
  for (let i = 0; i < 2000; i++) fn();
  Bun.gc(true);
  const start = Bun.nanoseconds();
  for (let i = 0; i < N; i++) fn();
  const elapsed = (Bun.nanoseconds() - start) / 1e6;
  console.log(`${name.padEnd(44)} ${((elapsed / N) * 1e6).toFixed(0).padStart(8)} ns/op`);
}

// Phase 1: creation only
bench("create: scope+signal+effect+dispose", () => {
  scope((dispose) => {
    const s = signal(0);
    effect(() => {
      s();
    });
    dispose();
  }, true);
});

// Phase 2: writes only (subscribed effect, batched, no flush yet)
{
  const s = signal(0);
  let _runs = 0;
  effect(() => {
    s();
    runs++;
  });
  let i = 0;
  bench("write: 100 batched writes + flush (1 effect)", () => {
    batch(() => {
      for (let j = 0; j < 100; j++) s.set(++i);
    });
  });
}

// Phase 3: single write + flush (effect re-run cost)
{
  const s = signal(0);
  effect(() => {
    s();
  });
  let i = 0;
  bench("write+flush: 1 write, 1 effect re-run", () => {
    batch(() => s.set(++i));
  });
}

// Phase 4: computed chain pull (5 deep)
{
  const s = signal(0);
  const c1 = computed(() => s() + 1);
  const c2 = computed(() => c1() + 1);
  const c3 = computed(() => c2() + 1);
  const c4 = computed(() => c3() + 1);
  const c5 = computed(() => c4() + 1);
  effect(() => {
    c5();
  });
  let i = 0;
  bench("chain: write + 5-computed pull + effect", () => {
    batch(() => s.set(++i));
  });
}

// Phase 5: clean read of a settled computed
{
  const s = signal(1);
  const c = computed(() => s() * 2);
  c();
  bench("read: settled computed (untracked)", () => {
    c();
  });
}

// Phase 6: diamond
{
  const s = signal(0);
  const a = computed(() => s() + 1);
  const b = computed(() => s() + 2);
  const d = computed(() => a() + b());
  effect(() => {
    d();
  });
  let i = 0;
  bench("diamond: write + pull + effect", () => {
    batch(() => s.set(++i));
  });
}

// Phase 7: raw writes, no subscribers
{
  const s = signal(0);
  let i = 0;
  bench("write: no-sub signal .set (x100)", () => {
    for (let j = 0; j < 100; j++) s.set(++i);
  });
}

// Phase 8: method extraction
{
  const s = signal(0);
  const set = s.set;
  let i = 0;
  bench("write: extracted set fn (x100)", () => {
    for (let j = 0; j < 100; j++) set(++i);
  });
}
