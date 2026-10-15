import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { createForm } from "@barqjs/form";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@barqjs/ui";

const card = css`
  width: 100%;
  max-width: 28rem;
`;

const actions = css`
  display: flex;
  gap: calc(var(--spacing) * 2);
`;

const submitted = css`
  margin: calc(var(--spacing) * 4) 0 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  white-space: pre-wrap;
`;

const between = (label: string, low: number, high: number) => (input: { value: string }) => {
  if (input.value.length < low) return `${label} must be at least ${low} characters.`;
  if (input.value.length > high) return `${label} must be at most ${high} characters.`;
  return undefined;
};

export default function BugReport() {
  const [sent, setSent] = createSignal("");

  const form = createForm(() => ({
    defaultValues: { title: "", description: "" },
    onSubmit: ({ value }) => {
      setSent(JSON.stringify(value, null, 2));
    },
  }));

  return (
    <Card class={card}>
      <CardHeader>
        <CardTitle>Bug Report</CardTitle>
        <CardDescription>Help us improve by reporting bugs you encounter.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="bug-report"
          noValidate
          onSubmit={(event: SubmitEvent) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="title"
              validators={{
                onSubmit: between("Bug title", 5, 32),
                onChange: between("Bug title", 5, 32),
              }}
            >
              {(field) => (
                <Field isInvalid={field().state.meta.isTouched && !field().state.meta.isValid}>
                  <FieldLabel for="bug-report-title">Bug Title</FieldLabel>
                  <Input
                    id="bug-report-title"
                    name="title"
                    value={field().state.value}
                    onBlur={() => field().handleBlur()}
                    onInput={(event: Event) =>
                      field().handleChange((event.currentTarget as HTMLInputElement).value)
                    }
                    aria-invalid={field().state.meta.isTouched && !field().state.meta.isValid}
                    placeholder="Login button not working on mobile"
                    autoComplete="off"
                  />
                  <FieldError
                    errors={field().state.meta.errors.map((message) => ({
                      message: String(message),
                    }))}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field
              name="description"
              validators={{
                onSubmit: between("Description", 20, 100),
                onChange: between("Description", 20, 100),
              }}
            >
              {(field) => (
                <Field isInvalid={field().state.meta.isTouched && !field().state.meta.isValid}>
                  <FieldLabel for="bug-report-description">Description</FieldLabel>
                  <Textarea
                    id="bug-report-description"
                    name="description"
                    value={field().state.value}
                    onBlur={() => field().handleBlur()}
                    onInput={(event: Event) =>
                      field().handleChange((event.currentTarget as HTMLTextAreaElement).value)
                    }
                    aria-invalid={field().state.meta.isTouched && !field().state.meta.isValid}
                    placeholder="I'm having an issue with the login button on mobile."
                    rows={6}
                  />
                  <FieldDescription>
                    Include steps to reproduce, expected behavior, and what actually happened.
                  </FieldDescription>
                  <FieldError
                    errors={field().state.meta.errors.map((message) => ({
                      message: String(message),
                    }))}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        </form>
        <pre class={submitted} data-slot="submitted">
          {sent()}
        </pre>
      </CardContent>
      <CardFooter class={actions}>
        <Button
          type="button"
          variant="outline"
          onPress={() => {
            form.reset();
            setSent("");
          }}
        >
          Reset
        </Button>
        <Button type="submit" form="bug-report">
          Submit
        </Button>
      </CardFooter>
    </Card>
  );
}
