import { css } from "@barqjs/css";
import { DirectionProvider, Field, FieldLabel, Progress } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
`;

const end = css`
  margin-inline-start: auto;
`;

export default function ProgressRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Field>
          <FieldLabel id="progress-rtl-upload">
            <span>تقدم الرفع</span>
            <span class={end}>٦٦%</span>
          </FieldLabel>
          <Progress value={66} aria-labelledby="progress-rtl-upload" />
        </Field>
      </div>
    </DirectionProvider>
  );
}
