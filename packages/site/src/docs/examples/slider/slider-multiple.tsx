import { css } from "@barqjs/css";
import { Slider } from "@barqjs/ui";

const slider = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
`;

export default function SliderMultiple() {
  return (
    <Slider
      aria-label="Breakpoints"
      defaultValue={[10, 20, 70]}
      max={100}
      step={10}
      class={slider}
    />
  );
}
