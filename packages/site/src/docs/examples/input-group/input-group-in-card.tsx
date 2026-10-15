import { css } from "@barqjs/css";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import { Mail } from "@barqjs/lucide/icons/mail";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@barqjs/ui";

const card = css`
  width: 100%;
`;

const feedback = css`
  min-height: 100px;
`;

const footer = css`
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
`;

export default function InputGroupInCard() {
  return (
    <Card class={card}>
      <CardHeader>
        <CardTitle>Card with Input Group</CardTitle>
        <CardDescription>This is a card with an input group.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel for="input-group-in-card-email">Email Address</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="input-group-in-card-email"
                type="email"
                placeholder="you@example.com"
              />
              <InputGroupAddon align="inline-end">
                <Mail />
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel for="input-group-in-card-website">Website URL</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>https://</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="input-group-in-card-website" placeholder="example.com" />
              <InputGroupAddon align="inline-end">
                <ExternalLink />
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel for="input-group-in-card-feedback">Feedback & Comments</FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                id="input-group-in-card-feedback"
                placeholder="Share your thoughts..."
                class={feedback}
              />
              <InputGroupAddon align="block-end">
                <InputGroupText>0/500 characters</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter class={footer}>
        <Button variant="outline">Cancel</Button>
        <Button>Submit</Button>
      </CardFooter>
    </Card>
  );
}
