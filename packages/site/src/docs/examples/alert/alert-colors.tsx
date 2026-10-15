import { css } from "@barqjs/css";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { Alert, AlertDescription, AlertTitle } from "@barqjs/ui";

const amber = css`
  max-width: 28rem;
  border-color: oklch(92.4% 0.12 95.746);
  background-color: oklch(98.7% 0.022 95.277);
  color: oklch(41.4% 0.112 45.904);

  .dark & {
    border-color: oklch(41.4% 0.112 45.904);
    background-color: oklch(27.9% 0.077 45.635);
    color: oklch(98.7% 0.022 95.277);
  }
`;

export default function AlertColors() {
  return (
    <Alert class={amber}>
      <TriangleAlert />
      <AlertTitle>Your subscription will expire in 3 days.</AlertTitle>
      <AlertDescription>
        Renew now to avoid service interruption or upgrade to a paid plan to continue using the
        service.
      </AlertDescription>
    </Alert>
  );
}
