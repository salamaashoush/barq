import { css } from "@barqjs/css";
import { Field, FieldLabel, Progress } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 24rem;
`;

const end = css`
  margin-inline-start: auto;
`;

export default function ProgressLabel() {
  return (
    <Field class={field}>
      <FieldLabel id="progress-label-upload">
        <span>Upload progress</span>
        <span class={end}>66%</span>
      </FieldLabel>
      <Progress value={66} aria-labelledby="progress-label-upload" />
    </Field>
  );
}
