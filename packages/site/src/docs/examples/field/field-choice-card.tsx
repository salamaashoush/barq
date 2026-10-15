import { css } from "@barqjs/css";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
  RadioGroup,
  RadioGroupItem,
} from "@barqjs/ui";

const group = css`
  width: 100%;
  max-width: 20rem;
`;

export default function FieldChoiceCard() {
  return (
    <FieldGroup class={group}>
      <FieldSet>
        <FieldLegend variant="label">Compute Environment</FieldLegend>
        <FieldDescription>Select the compute environment for your cluster.</FieldDescription>
        <RadioGroup defaultValue="kubernetes" aria-label="Compute Environment">
          <FieldLabel for="field-choice-card-kubernetes">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Kubernetes</FieldTitle>
                <FieldDescription>Run GPU workloads on a K8s cluster.</FieldDescription>
              </FieldContent>
              <RadioGroupItem value="kubernetes" id="field-choice-card-kubernetes" />
            </Field>
          </FieldLabel>
          <FieldLabel for="field-choice-card-vm">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Virtual Machine</FieldTitle>
                <FieldDescription>Access a cluster to run GPU workloads.</FieldDescription>
              </FieldContent>
              <RadioGroupItem value="vm" id="field-choice-card-vm" />
            </Field>
          </FieldLabel>
        </RadioGroup>
      </FieldSet>
    </FieldGroup>
  );
}
