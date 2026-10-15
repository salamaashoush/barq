import { css } from "@barqjs/css";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Info } from "@barqjs/lucide/icons/info";
import { Alert, AlertDescription, AlertTitle } from "@barqjs/ui";

const stack = css`
  display: grid;
  width: 100%;
  max-width: 28rem;
  align-items: start;
  gap: calc(var(--spacing) * 4);
`;

export default function AlertDemo() {
  return (
    <div class={stack}>
      <Alert>
        <CircleCheck />
        <AlertTitle>Payment successful</AlertTitle>
        <AlertDescription>
          Your payment of $29.99 has been processed. A receipt has been sent to your email address.
        </AlertDescription>
      </Alert>
      <Alert>
        <Info />
        <AlertTitle>New feature available</AlertTitle>
        <AlertDescription>
          We've added dark mode support. You can enable it in your account settings.
        </AlertDescription>
      </Alert>
    </div>
  );
}
