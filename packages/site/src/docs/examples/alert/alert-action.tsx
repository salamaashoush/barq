import { css } from "@barqjs/css";
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "@barqjs/ui";

const alert = css`
  max-width: 28rem;
`;

export default function AlertActionExample() {
  return (
    <Alert class={alert}>
      <AlertTitle>Dark mode is now available</AlertTitle>
      <AlertDescription>Enable it under your profile settings to get started.</AlertDescription>
      <AlertAction>
        <Button size="xs" variant="default">
          Enable
        </Button>
      </AlertAction>
    </Alert>
  );
}
