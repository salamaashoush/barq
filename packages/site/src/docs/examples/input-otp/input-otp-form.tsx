import { css } from "@barqjs/css";
import { RefreshCw } from "@barqjs/lucide/icons/refresh-cw";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@barqjs/ui";

const card = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const strong = css`
  font-weight: 500;
`;

const row = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const large = css`
  & > [data-slot="input-otp-slot"] {
    height: calc(var(--spacing) * 12);
    width: calc(var(--spacing) * 11);
    font-size: 1.25rem;
    line-height: 1.75rem;
  }
`;

const gap = css`
  margin-inline: calc(var(--spacing) * 2);
`;

const full = css`
  width: 100%;
`;

const help = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const support = css`
  text-decoration-line: underline;
  text-underline-offset: 4px;
  transition: color 150ms;

  &:hover {
    color: var(--primary);
  }
`;

export default function InputOTPForm() {
  return (
    <Card class={card}>
      <CardHeader>
        <CardTitle>Verify your login</CardTitle>
        <CardDescription>
          Enter the verification code we sent to your email address:{" "}
          <span class={strong}>salama@example.com</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <div class={row}>
            <FieldLabel for="input-otp-form-code">Verification code</FieldLabel>
            <Button variant="outline" size="xs">
              <RefreshCw />
              Resend Code
            </Button>
          </div>
          <InputOTP maxLength={6} id="input-otp-form-code" required>
            <InputOTPGroup class={large}>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator class={gap} />
            <InputOTPGroup class={large}>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <FieldDescription>
            <a href="#">I no longer have access to this email address.</a>
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter>
        <Field>
          <Button type="submit" class={full}>
            Verify
          </Button>
          <div class={help}>
            Having trouble signing in?{" "}
            <a href="#" class={support}>
              Contact support
            </a>
          </div>
        </Field>
      </CardFooter>
    </Card>
  );
}
