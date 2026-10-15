import { createSignal, onSettled } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Progress } from "@barqjs/ui";

const bar = css`
  width: 60%;
`;

export default function ProgressDemo() {
  const [progress, setProgress] = createSignal(13);

  onSettled(() => {
    setTimeout(() => setProgress(66), 500);
  });

  return <Progress aria-label="Progress" value={progress()} class={bar} />;
}
