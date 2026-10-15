import { css } from "@barqjs/css";
import {
  Field,
  FieldLabel,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "@barqjs/ui";

const field = css`
  width: fit-content;
`;

export default function InputOTPPattern() {
  return (
    <Field class={field}>
      <FieldLabel for="input-otp-pattern-digits">Digits Only</FieldLabel>
      <InputOTP id="input-otp-pattern-digits" maxLength={6} pattern={REGEXP_ONLY_DIGITS}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    </Field>
  );
}
