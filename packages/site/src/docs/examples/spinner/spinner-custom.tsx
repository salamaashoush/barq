import { LoaderCircle } from "@barqjs/lucide/icons/loader-circle";
import { css } from "@barqjs/css";

const spinning = css`
  width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
`;

export default function SpinnerCustom() {
  return <LoaderCircle role="status" aria-label="Loading" class={spinning} />;
}
