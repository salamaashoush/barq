import { css } from "@barqjs/css";
import { Badge } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

const blue = css`
  background-color: oklch(97% 0.014 254.604);
  color: oklch(48.8% 0.243 264.376);

  .dark & {
    background-color: oklch(28.2% 0.091 267.935);
    color: oklch(80.9% 0.105 251.813);
  }
`;

const green = css`
  background-color: oklch(98.2% 0.018 155.826);
  color: oklch(52.7% 0.154 150.069);

  .dark & {
    background-color: oklch(26.6% 0.065 152.934);
    color: oklch(87.1% 0.15 154.449);
  }
`;

const sky = css`
  background-color: oklch(97.7% 0.013 236.62);
  color: oklch(50% 0.134 242.749);

  .dark & {
    background-color: oklch(29.3% 0.066 243.157);
    color: oklch(82.8% 0.111 230.318);
  }
`;

const purple = css`
  background-color: oklch(97.7% 0.014 308.299);
  color: oklch(49.6% 0.265 301.924);

  .dark & {
    background-color: oklch(29.1% 0.149 302.717);
    color: oklch(82.7% 0.119 306.383);
  }
`;

const red = css`
  background-color: oklch(97.1% 0.013 17.38);
  color: oklch(50.5% 0.213 27.518);

  .dark & {
    background-color: oklch(25.8% 0.092 26.042);
    color: oklch(80.8% 0.114 19.571);
  }
`;

export default function BadgeCustomColors() {
  return (
    <div class={row}>
      <Badge class={blue}>Blue</Badge>
      <Badge class={green}>Green</Badge>
      <Badge class={sky}>Sky</Badge>
      <Badge class={purple}>Purple</Badge>
      <Badge class={red}>Red</Badge>
    </div>
  );
}
