import { css } from "@barqjs/css";
import { Button, Spinner } from "@barqjs/ui";

const row = css`
  display: flex;
  gap: calc(var(--spacing) * 2);
`;

export default function ButtonSpinner() {
  return (
    <div class={row}>
      <Button variant="outline" disabled>
        <Spinner />
        Generating
      </Button>
      <Button variant="secondary" disabled>
        Downloading
        <Spinner />
      </Button>
    </div>
  );
}
