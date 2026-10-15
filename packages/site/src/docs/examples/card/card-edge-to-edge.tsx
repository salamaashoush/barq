import { css } from "@barqjs/css";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@barqjs/ui";

const card = css`
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
`;

const content = css`
  margin-bottom: calc(var(--card-spacing) * -1);
`;

const terms = css`
  margin-inline: calc(var(--card-spacing) * -1);
  max-height: calc(var(--spacing) * 48);
  overflow-y: scroll;
  border-top: 1px solid var(--border);
  background-color: color-mix(in oklab, var(--muted) 50%, transparent);
  padding: calc(var(--spacing) * 4) var(--card-spacing);
  font-size: 0.875rem;
  line-height: 1.625;

  & p {
    margin: 0;
  }

  & p + p {
    margin-top: calc(var(--spacing) * 4);
  }
`;

const footer = css`
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
`;

export default function CardEdgeToEdge() {
  return (
    <Card class={card}>
      <CardHeader>
        <CardTitle>Terms of Service</CardTitle>
        <CardDescription>Review the terms before accepting the agreement.</CardDescription>
      </CardHeader>
      <CardContent class={content}>
        <div class={terms}>
          <p>
            These terms govern your use of the workspace, including access to shared documents,
            project files, and collaboration tools.
          </p>
          <p>
            You are responsible for the content you upload and for ensuring that your team has the
            appropriate permissions to view or edit it.
          </p>
          <p>
            We may update features or limits as the service evolves. When those changes materially
            affect your workflow, we will notify your workspace administrators.
          </p>
          <p>
            By continuing, you agree to keep your account credentials secure and to follow your
            organization's acceptable use policies.
          </p>
        </div>
      </CardContent>
      <CardFooter class={footer}>
        <Button variant="outline">Decline</Button>
        <Button>Accept</Button>
      </CardFooter>
    </Card>
  );
}
