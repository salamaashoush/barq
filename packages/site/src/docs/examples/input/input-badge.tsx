import { css } from "@barqjs/css";
import { Badge, Field, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

const badge = css`
  margin-inline-start: auto;
`;

export default function InputBadge() {
  return (
    <Field class={field}>
      <FieldLabel for="input-badge-webhook">
        <span>Webhook URL</span>
        <Badge variant="secondary" class={badge}>
          Beta
        </Badge>
      </FieldLabel>
      <Input id="input-badge-webhook" type="url" placeholder="https://api.example.com/webhook" />
    </Field>
  );
}
