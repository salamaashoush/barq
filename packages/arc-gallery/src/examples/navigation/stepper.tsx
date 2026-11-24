import { createSignal } from "@barqjs/core";
import { Button, Grid, Inline, Stack, Stepper, Text, type StepItem } from "@barqjs/arc";

const STEPS: StepItem[] = [
  { id: "account", label: "Account", description: "Name and email" },
  { id: "team", label: "Team", description: "Invite teammates", optional: true },
  { id: "billing", label: "Billing", description: "Plan and card" },
  { id: "review", label: "Review" },
];

export default function Steppers() {
  const [step, setStep] = createSignal("account");
  const [done, setDone] = createSignal<string | null>(null);
  const at = (): number => STEPS.findIndex((one) => one.id === step());
  const go = (by: number): void => {
    const next = STEPS[at() + by];
    if (next === undefined) return;
    if (by > 0) setDone(step());
    setStep(next.id);
  };
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <Stack gap={4}>
        <Stepper
          aria-label="Workspace setup"
          items={STEPS}
          selectedKey={step()}
          onSelectionChange={setStep}
          lastCompletedStep={done()}
          onLastCompletedStepChange={setDone}
        />
        <Text size="sm" color="muted">
          Step {at() + 1} of {STEPS.length}: {STEPS[at()]?.label}. Completed steps can be revisited.
        </Text>
        <Inline gap={2}>
          <Button variant="outline" isDisabled={at() === 0} onPress={() => go(-1)}>
            Back
          </Button>
          <Button isDisabled={at() === STEPS.length - 1} onPress={() => go(1)}>
            Continue
          </Button>
        </Inline>
      </Stack>
      <Stack gap={6}>
        <Stepper
          aria-label="Deploy, vertical"
          orientation="vertical"
          isReadOnly
          items={[
            { id: "build", label: "Build", description: "2 min 14 s" },
            { id: "test", label: "Test", description: "1 failing check", invalid: true },
            { id: "deploy", label: "Deploy" },
          ]}
          defaultSelectedKey="test"
          defaultLastCompletedStep="build"
        />
        <Stepper
          aria-label="Disabled"
          isDisabled
          items={STEPS.slice(0, 3)}
          defaultSelectedKey="team"
          defaultLastCompletedStep="account"
        />
      </Stack>
    </Grid>
  );
}
