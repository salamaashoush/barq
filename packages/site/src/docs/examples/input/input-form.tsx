import { css } from "@barqjs/css";
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barqjs/ui";

const form = css`
  width: 100%;
  max-width: 24rem;
`;

const columns = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--spacing) * 4);
`;

export default function InputForm() {
  return (
    <form class={form} onSubmit={(event: SubmitEvent) => event.preventDefault()}>
      <FieldGroup>
        <Field>
          <FieldLabel for="input-form-name">Name</FieldLabel>
          <Input id="input-form-name" type="text" placeholder="Salama Ashoush" required />
        </Field>
        <Field>
          <FieldLabel for="input-form-email">Email</FieldLabel>
          <Input id="input-form-email" type="email" placeholder="salama@example.com" />
          <FieldDescription>We'll never share your email with anyone.</FieldDescription>
        </Field>
        <div class={columns}>
          <Field>
            <FieldLabel for="input-form-phone">Phone</FieldLabel>
            <Input id="input-form-phone" type="tel" placeholder="+1 (555) 123-4567" />
          </Field>
          <Field>
            <FieldLabel for="input-form-country">Country</FieldLabel>
            <Select name="country" defaultValue="us">
              <SelectTrigger id="input-form-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="uk">United Kingdom</SelectItem>
                <SelectItem value="ca">Canada</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel for="input-form-address">Address</FieldLabel>
          <Input id="input-form-address" type="text" placeholder="123 Main St" />
        </Field>
        <Field orientation="horizontal">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit">Submit</Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
