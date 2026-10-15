import { createSignal, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Maximize } from "@barqjs/lucide/icons/maximize";
import { Minimize } from "@barqjs/lucide/icons/minimize";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  srOnly,
} from "@barqjs/ui";

const card = css`
  margin-inline: auto;
  width: 100%;
  max-width: 20rem;
`;

const row = css`
  display: flex;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2);
`;

const grid = css`
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--spacing) * 2);
`;

const more = css`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  gap: calc(var(--spacing) * 2);
`;

export default function CollapsibleSettings() {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <Card class={card} size="sm">
      <CardHeader>
        <CardTitle>Radius</CardTitle>
        <CardDescription>Set the corner radius of the element.</CardDescription>
      </CardHeader>
      <CardContent>
        <Collapsible open={isOpen()} onOpenChange={setIsOpen} class={row}>
          <FieldGroup class={grid}>
            <Field>
              <FieldLabel for="collapsible-settings-top-x" class={srOnly}>
                Radius X
              </FieldLabel>
              <Input id="collapsible-settings-top-x" placeholder="0" defaultValue={0} />
            </Field>
            <Field>
              <FieldLabel for="collapsible-settings-top-y" class={srOnly}>
                Radius Y
              </FieldLabel>
              <Input id="collapsible-settings-top-y" placeholder="0" defaultValue={0} />
            </Field>
            <CollapsibleContent class={more}>
              <Field>
                <FieldLabel for="collapsible-settings-bottom-x" class={srOnly}>
                  Radius X
                </FieldLabel>
                <Input id="collapsible-settings-bottom-x" placeholder="0" defaultValue={0} />
              </Field>
              <Field>
                <FieldLabel for="collapsible-settings-bottom-y" class={srOnly}>
                  Radius Y
                </FieldLabel>
                <Input id="collapsible-settings-bottom-y" placeholder="0" defaultValue={0} />
              </Field>
            </CollapsibleContent>
          </FieldGroup>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More radius fields">
              <Show when={isOpen()} fallback={<Maximize />}>
                <Minimize />
              </Show>
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
