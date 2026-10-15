import { css } from "@barqjs/css";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Alert, AlertDescription, AlertTitle } from "@barqjs/ui";

const alert = css`
  max-width: 28rem;
`;

export default function AlertBasic() {
  return (
    <Alert class={alert}>
      <CircleCheck />
      <AlertTitle>Account updated successfully</AlertTitle>
      <AlertDescription>
        Your profile information has been saved. Changes will be reflected immediately.
      </AlertDescription>
    </Alert>
  );
}
