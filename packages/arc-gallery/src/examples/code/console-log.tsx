import { createSignal, onCleanup } from "@barqjs/core";
import { Button, ConsoleLogView, Grid, Inline, type LogEntry, Stack } from "@barqjs/arc";

const ESC = String.fromCharCode(27);

const RUN: LogEntry[] = [
  {
    id: "1",
    level: "info",
    time: 12,
    source: "script",
    text: "Opening https://shop.acme.example.com",
  },
  { id: "2", level: "log", time: 840, source: "page", text: "[analytics] page_view /" },
  {
    id: "3",
    level: "warn",
    time: 1210,
    source: "page",
    text: "Image /hero.jpg is 2.4 MB; consider a smaller one",
  },
  {
    id: "4",
    level: "log",
    time: 1325,
    source: "script",
    text: '{"step":"add-to-cart","sku":"mug","qty":2,"cart":{"items":2,"total":42.5}}',
  },
  {
    id: "5",
    level: "debug",
    time: 1330,
    source: "script",
    text: "fill #password [redacted: SHOP_PASSWORD]",
  },
  {
    id: "6",
    level: "error",
    time: 2050,
    source: "page",
    text: "TypeError: Cannot read properties of undefined (reading 'total')\n    at renderSummary (checkout.js:88:17)\n    at onSubmit (checkout.js:41:5)",
  },
  {
    id: "7",
    level: "info",
    time: 2100,
    source: "script",
    text: `${ESC}[31m✗${ESC}[0m checkout ${ESC}[2m(2.1 s)${ESC}[0m`,
  },
];

const LIVE_LINES = [
  "GET /api/health 200 4 ms",
  "worker-2 picked job 8f2",
  `${ESC}[33mretry${ESC}[0m job 8f2 after timeout`,
  "worker-2 done in 1.1 s",
  '{"queue":"default","waiting":12,"running":3}',
];

export default function ConsoleLog() {
  const [lines, setLines] = createSignal<LogEntry[]>([]);
  const [running, setRunning] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  let count = 0;
  function stop(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    setRunning(false);
  }
  function start(): void {
    stop();
    setRunning(true);
    timer = setInterval(() => {
      const text = LIVE_LINES[count % LIVE_LINES.length] ?? "";
      count++;
      setLines((all) => [
        ...all,
        {
          id: String(count),
          level: count % 7 === 0 ? "warn" : "info",
          time: new Date(Date.UTC(2026, 10, 26, 9, 30, 0, count * 350)).toISOString(),
          source: `worker-${String((count % 3) + 1)}`,
          text,
        },
      ]);
    }, 700);
  }
  onCleanup(stop);
  return (
    <Stack gap={6}>
      <ConsoleLogView entries={RUN} aria-label="Browser console" height={260} />
      <Stack gap={2}>
        <Inline gap={2}>
          <Button size="sm" variant="outline" onPress={() => (running() ? stop() : start())}>
            {running() ? "Stop" : "Stream lines"}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setLines([])}>
            Clear
          </Button>
        </Inline>
        <ConsoleLogView entries={lines()} live={running()} aria-label="Worker log" height={220} />
      </Stack>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
        <ConsoleLogView entries={[]} isLoading aria-label="Loading" height={120} toolbar={false} />
        <ConsoleLogView
          entries={[]}
          errorMessage="The runner kept no console for this run."
          aria-label="Unavailable"
          height={120}
          toolbar={false}
        />
      </Grid>
    </Stack>
  );
}
