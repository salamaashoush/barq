import { Show, createSignal } from "@barqjs/core";
import {
  Button,
  Coachmark,
  Inline,
  Input,
  Spotlight,
  Stack,
  Text,
  Tour,
  useTourProgress,
} from "@barqjs/arc";
import { Plus } from "@barqjs/lucide/icons/plus";

export default function Tours() {
  const progress = useTourProgress("acme-invoices-intro");
  const [touring, setTouring] = createSignal(false);
  const [hint, setHint] = createSignal(false);
  const [lit, setLit] = createSignal(false);

  return (
    <Stack gap={4}>
      <Inline gap={2} wrap align="center">
        <Button id="tour-new-invoice">
          <Plus />
          New invoice
        </Button>
        <Input id="tour-search" aria-label="Search invoices" placeholder="Search invoices" />
        <Button id="tour-export" variant="outline">
          Export
        </Button>
      </Inline>

      <Inline gap={2} wrap>
        <Button
          variant="secondary"
          onPress={() => {
            progress.reset();
            setTouring(true);
          }}
        >
          Start the tour
        </Button>
        <Button variant="outline" onPress={() => setHint(true)}>
          Show one coachmark
        </Button>
        <Button variant="outline" onPress={() => setLit(!lit())}>
          {lit() ? "Hide spotlight" : "Spotlight the search"}
        </Button>
      </Inline>
      <Text size="sm" color="muted" aria-live="polite">
        Tour {progress.status()}, at step {progress.step() + 1}. Kept in localStorage, so a reload
        resumes it.
      </Text>

      <Tour
        open={touring()}
        onOpenChange={setTouring}
        step={progress.step()}
        onStepChange={progress.setStep}
        onFinish={() => {
          progress.complete();
          setTouring(false);
        }}
        onSkip={() => {
          progress.dismiss();
          setTouring(false);
        }}
        steps={[
          {
            target: "#tour-new-invoice",
            title: "Create an invoice",
            body: "Start every invoice here.",
          },
          {
            target: "#tour-search",
            title: "Find one",
            body: "Search by number, customer or amount.",
          },
          {
            target: "#tour-export",
            title: "Take it with you",
            body: "Export what you see as CSV.",
            placement: "bottom",
          },
        ]}
      />

      <Coachmark
        target="#tour-export"
        title="Exports moved"
        isOpen={hint()}
        onDismiss={() => setHint(false)}
        onNext={() => setHint(false)}
        nextLabel="Got it"
        skipLabel="Dismiss"
      >
        Exports now run in the background and land in your inbox.
      </Coachmark>

      <Show when={lit()}>
        <Spotlight target="#tour-search" padding={6} />
      </Show>
    </Stack>
  );
}
