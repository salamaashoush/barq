import { createSignal } from "@barqjs/core";
import {
  Button,
  Countdown,
  DescriptionList,
  Inline,
  RelativeTime,
  SessionExpiryWarning,
  Stack,
  Text,
} from "@barqjs/arc";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Timers() {
  const [quizEnds, setQuizEnds] = createSignal(Date.now() + 75_000);
  const [sessionEnds, setSessionEnds] = createSignal(Date.now() + 150_000);
  const [limitEnds, setLimitEnds] = createSignal(Date.now() + 100_000);
  const [started] = createSignal(Date.now() - 3_725_000);
  const [submitted, setSubmitted] = createSignal(false);
  return (
    <Stack gap={5}>
      <DescriptionList
        items={[
          {
            term: "Quiz, time left",
            details: (
              <Countdown
                to={quizEnds()}
                label="Time left in the quiz"
                warnAt={60_000}
                dangerAt={30_000}
                onExpire={() => setSubmitted(true)}
              />
            ),
            action: (
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  setSubmitted(false);
                  setQuizEnds(Date.now() + 75_000);
                }}
              >
                Restart
              </Button>
            ),
          },
          {
            term: "Run, elapsed",
            details: <Countdown from={started()} length="short" units={3} label="Running for" />,
          },
          {
            term: "Deadline",
            details: <Countdown to={Date.now() + 3 * 86_400_000} length="long" units={2} />,
          },
          {
            term: "Last deploy",
            details: <RelativeTime value={Date.now() - 42 * 60_000} exact />,
          },
        ]}
      />
      <Text size="sm" color="muted">
        {submitted()
          ? "Time ran out, so the quiz was submitted."
          : "The quiz submits itself at zero."}
      </Text>
      <SessionExpiryWarning
        expiresAt={sessionEnds()}
        onExtend={async () => {
          await wait(500);
          setSessionEnds(Date.now() + 150_000);
        }}
      />
      <SessionExpiryWarning
        expiresAt={limitEnds()}
        reason="limit"
        extendLabel="Extend 15 minutes"
        onExtend={async () => {
          await wait(500);
          setLimitEnds(Date.now() + 15 * 60_000);
        }}
      />
      <Inline gap={2}>
        <Button variant="outline" size="sm" onPress={() => setSessionEnds(Date.now() + 20_000)}>
          End the session soon
        </Button>
      </Inline>
    </Stack>
  );
}
