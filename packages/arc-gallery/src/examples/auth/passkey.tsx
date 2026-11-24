import { Container, PasskeyPrompt, toast } from "@barqjs/arc";

export default function Passkey() {
  let attempts = 0;

  return (
    <Container size="sm">
      <PasskeyPrompt
        description="The first try fails, as a dismissed browser prompt would; Retry succeeds."
        onAuthenticate={async () => {
          await new Promise((resolve) => setTimeout(resolve, 900));
          attempts += 1;
          if (attempts === 1) throw new Error("NotAllowedError");
          toast.success("Signed in with your passkey");
        }}
        onFallback={() => toast("Use your password instead")}
      />
    </Container>
  );
}
