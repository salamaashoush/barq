import { Container, ResetPasswordForm } from "@barqjs/arc";

export default function ResetPassword() {
  return (
    <Container size="sm">
      <ResetPasswordForm
        signInHref="#sign-in"
        onSubmit={async (password) => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (password.includes("password"))
            return { form: "That password appears in known breaches. Choose another." };
          return undefined;
        }}
      />
    </Container>
  );
}
