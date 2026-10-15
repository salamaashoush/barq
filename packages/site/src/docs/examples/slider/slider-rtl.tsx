import { css } from "@barqjs/css";
import { DirectionProvider, Slider } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
`;

export default function SliderRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Slider aria-label="مستوى الصوت" defaultValue={[75]} max={100} step={1} />
      </div>
    </DirectionProvider>
  );
}
