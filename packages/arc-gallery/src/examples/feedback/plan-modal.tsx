import { For, createSignal } from "@barqjs/core";
import {
  Button,
  type ModalOwnProps,
  RadioGroup,
  RadioGroupItem,
  ResponsiveOverlay,
  Stack,
  Label,
  Inline,
} from "@barqjs/arc";

export interface PlanModalProps extends ModalOwnProps<string> {
  current: string;
  plans: readonly string[];
}

export function PlanModal(props: PlanModalProps) {
  const [plan, setPlan] = createSignal(props.current);
  return (
    <ResponsiveOverlay
      heading="Change plan"
      description="Billing changes at the start of the next period."
      open={props.modal.isOpen()}
      onOpenChange={props.modal.onOpenChange}
      footer={
        <Inline gap={2} justify="end">
          <Button variant="outline" onPress={props.modal.dismiss}>
            Cancel
          </Button>
          <Button onPress={() => props.modal.resolve(plan())}>Change plan</Button>
        </Inline>
      }
    >
      <RadioGroup value={plan()} onChange={setPlan} aria-label="Plan">
        <Stack gap={2}>
          <For each={props.plans}>
            {(name: string) => (
              <Inline gap={2}>
                <RadioGroupItem value={name} id={`plan-${name}`} />
                <Label for={`plan-${name}`}>{name}</Label>
              </Inline>
            )}
          </For>
        </Stack>
      </RadioGroup>
    </ResponsiveOverlay>
  );
}
