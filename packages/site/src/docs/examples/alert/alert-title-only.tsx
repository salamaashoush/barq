import { css } from "@barqjs/css";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Alert, AlertTitle } from "@barqjs/ui";

const alert = css`
  max-width: 28rem;
`;

export default function AlertTitleOnly() {
  return (
    <Alert class={alert}>
      <BadgeCheck />
      <AlertTitle>Everything is up to date.</AlertTitle>
    </Alert>
  );
}
