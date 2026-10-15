import { css } from "@barqjs/css";
import { Slider } from "@barqjs/ui";

const slider = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
`;

export default function SliderDemo() {
  return <Slider aria-label="Volume" defaultValue={[75]} max={100} step={1} class={slider} />;
}
