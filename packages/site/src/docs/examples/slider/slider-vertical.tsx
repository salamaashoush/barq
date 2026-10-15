import { css } from "@barqjs/css";
import { Slider } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 6);
`;

const slider = css`
  height: 10rem;
`;

export default function SliderVertical() {
  return (
    <div class={frame}>
      <Slider
        aria-label="Bass"
        defaultValue={[50]}
        max={100}
        step={1}
        orientation="vertical"
        class={slider}
      />
      <Slider
        aria-label="Treble"
        defaultValue={[25]}
        max={100}
        step={1}
        orientation="vertical"
        class={slider}
      />
    </div>
  );
}
