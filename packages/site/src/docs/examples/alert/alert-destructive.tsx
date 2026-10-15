import { css } from "@barqjs/css";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { Alert, AlertDescription, AlertTitle } from "@barqjs/ui";

const alert = css`
  max-width: 28rem;
`;

export default function AlertDestructive() {
  return (
    <Alert variant="destructive" class={alert}>
      <CircleAlert />
      <AlertTitle>Payment failed</AlertTitle>
      <AlertDescription>
        Your payment could not be processed. Please check your payment method and try again.
      </AlertDescription>
    </Alert>
  );
}
