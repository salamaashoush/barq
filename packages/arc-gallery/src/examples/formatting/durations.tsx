import { createEffect, createSignal, untrack } from "@barqjs/core";
import { Button, DescriptionList, Duration, Inline, Stack, Text, durationText } from "@barqjs/arc";
import { useLocale } from "@barqjs/aria/i18n";

const BUILD = 3_909_000;

export default function Durations() {
  const locale = useLocale();
  const [running, setRunning] = createSignal(false);
  const [elapsed, setElapsed] = createSignal(0);

  createEffect(running, (on) => {
    if (!on) return undefined;
    const started = Date.now() - untrack(elapsed);
    const timer = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(timer);
  });

  return (
    <Stack gap={4}>
      <DescriptionList
        columns={2}
        items={[
          { term: "Short, two units", details: <Duration value={BUILD} /> },
          { term: "Long", details: <Duration value={BUILD} length="long" /> },
          {
            term: "Narrow, three units",
            details: <Duration value={BUILD} length="narrow" units={3} />,
          },
          { term: "Digital", details: <Duration value={BUILD} length="digital" /> },
          { term: "Under a second", details: <Duration value={420} /> },
          { term: "A long retention", details: <Duration value={86_400_000 * 45} length="long" /> },
        ]}
      />
      <Stack gap={2}>
        <Text weight="medium">durationText, in a stopwatch</Text>
        <Inline gap={3} align="center">
          <Text size="lg" numeric aria-live="off">
            {durationText(elapsed(), locale().locale, { length: "digital", hours: "auto" })}
          </Text>
          <Text color="muted">
            {durationText(elapsed(), locale().locale, { length: "long", units: 2 })}
          </Text>
        </Inline>
        <Inline gap={2}>
          <Button size="sm" onPress={() => setRunning(!running())}>
            {running() ? "Pause" : "Start"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={running() || elapsed() === 0}
            onPress={() => setElapsed(0)}
          >
            Reset
          </Button>
        </Inline>
      </Stack>
    </Stack>
  );
}
