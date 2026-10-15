import { css } from "@barqjs/css";
import { Slider } from "@barqjs/ui";

const slider = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
`;

export default function SliderDisabled() {
  return (
    <Slider aria-label="Volume" defaultValue={[50]} max={100} step={1} disabled class={slider} />
  );
}
