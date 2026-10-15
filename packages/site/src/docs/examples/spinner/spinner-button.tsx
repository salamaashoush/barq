import { css } from "@barqjs/css";
import { Button, Spinner } from "@barqjs/ui";

const column = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

export default function SpinnerButton() {
  return (
    <div class={column}>
      <Button disabled size="sm">
        <Spinner />
        Loading...
      </Button>
      <Button variant="outline" disabled size="sm">
        <Spinner />
        Please wait
      </Button>
      <Button variant="secondary" disabled size="sm">
        <Spinner />
        Processing
      </Button>
    </div>
  );
}
