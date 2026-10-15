import { createSignal } from "@barqjs/core";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@barqjs/ui";

export default function InputOTPInvalid() {
  const [value, setValue] = createSignal("000000");

  return (
    <InputOTP
      maxLength={6}
      aria-label="One-time password"
      aria-invalid="true"
      value={value()}
      onChange={setValue}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}
