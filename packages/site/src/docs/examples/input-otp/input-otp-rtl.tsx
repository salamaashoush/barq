import { css } from "@barqjs/css";
import {
  DirectionProvider,
  Field,
  FieldLabel,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@barqjs/ui";

const field = css`
  margin-inline: auto;
  max-width: 20rem;
`;

export default function InputOTPRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Field class={field}>
          <FieldLabel for="input-otp-rtl">رمز التحقق</FieldLabel>
          <InputOTP maxLength={6} defaultValue="123456" dir="rtl" id="input-otp-rtl">
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
      </div>
    </DirectionProvider>
  );
}
