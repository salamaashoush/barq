import { Container, TwoFactorForm, toast } from "@barqjs/arc";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function TwoFactor() {
  return (
    <Container size="sm">
      <TwoFactorForm
        description="Enter the code from your authenticator app. 123456 works; any other code is refused."
        onSubmit={async (code, { recovery }) => {
          await wait(700);
          if (recovery)
            return code.trim() === "acme-7f3k-29xd"
              ? undefined
              : { form: "That recovery code is not valid." };
          if (code !== "123456") return { form: "That code is not valid or has expired." };
          toast.success("Verified");
          return undefined;
        }}
        onResend={async () => {
          await wait(500);
          toast("A new code is on its way to +20 ••• ••• 4417");
        }}
        onPasskey={async () => {
          await wait(500);
          toast.success("Signed in with your passkey");
        }}
      />
    </Container>
  );
}
