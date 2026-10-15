import { createForm } from "@barqjs/form";
import { Field, FieldDescription, FieldError, FieldLabel, Input } from "@barqjs/ui";

export default function Anatomy() {
  const form = createForm(() => ({ defaultValues: { title: "" } }));

  return (
    <form.Field name="title">
      {(field) => (
        <Field isInvalid={!field().state.meta.isValid}>
          <FieldLabel for="anatomy-title">Bug Title</FieldLabel>
          <Input
            id="anatomy-title"
            value={field().state.value}
            onBlur={() => field().handleBlur()}
            onInput={(event: Event) =>
              field().handleChange((event.currentTarget as HTMLInputElement).value)
            }
          />
          <FieldDescription>Provide a concise title for your bug report.</FieldDescription>
          <FieldError
            errors={field().state.meta.errors.map((message) => ({ message: String(message) }))}
          />
        </Field>
      )}
    </form.Field>
  );
}
