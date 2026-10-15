import { css } from "@barqjs/css";
import { Slider } from "@barqjs/ui";

const slider = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
`;

export default function SliderRange() {
  return (
    <Slider aria-label="Price range" defaultValue={[25, 50]} max={100} step={5} class={slider} />
  );
}
