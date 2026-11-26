import { createSignal } from "@barqjs/core";
import { Button, Inline, Stack, Text, defineModal, openModal, preloadModal } from "@barqjs/arc";

const planModal = defineModal("change-plan", () =>
  import("./plan-modal.tsx").then((module) => module.PlanModal),
);

export default function Modals() {
  const [plan, setPlan] = createSignal("Team");
  async function change(): Promise<void> {
    const chosen = await openModal(planModal, {
      current: plan(),
      plans: ["Starter", "Team", "Business"],
    });
    if (chosen !== undefined) setPlan(chosen);
  }
  return (
    <Stack gap={3}>
      <Inline gap={2}>
        <Button
          onPress={() => void change()}
          onHoverStart={() => preloadModal(planModal)}
          onFocus={() => preloadModal(planModal)}
        >
          Change plan
        </Button>
      </Inline>
      <Text size="sm" color="muted">
        On the {plan()} plan. The dialog's code loads on hover, and it resolves with the plan
        chosen.
      </Text>
    </Stack>
  );
}
