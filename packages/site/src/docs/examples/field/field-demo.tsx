import { css } from "@barqjs/css";
import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 28rem;
`;

const expiry = css`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(var(--spacing) * 4);
`;

const plain = css`
  font-weight: 400;
`;

const fixed = css`
  resize: none;
`;

export default function FieldDemo() {
  return (
    <div class={frame}>
      <form onSubmit={(event: SubmitEvent) => event.preventDefault()}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Payment Method</FieldLegend>
            <FieldDescription>All transactions are secure and encrypted</FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel for="field-demo-card-name">Name on Card</FieldLabel>
                <Input id="field-demo-card-name" placeholder="Salama" required />
              </Field>
              <Field>
                <FieldLabel for="field-demo-card-number">Card Number</FieldLabel>
                <Input id="field-demo-card-number" placeholder="1234 5678 9012 3456" required />
                <FieldDescription>Enter your 16-digit card number</FieldDescription>
              </Field>
              <div class={expiry}>
                <Field>
                  <FieldLabel for="field-demo-exp-month">Month</FieldLabel>
                  <Select name="field-demo-exp-month">
                    <SelectTrigger id="field-demo-exp-month">
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="01">01</SelectItem>
                        <SelectItem value="02">02</SelectItem>
                        <SelectItem value="03">03</SelectItem>
                        <SelectItem value="04">04</SelectItem>
                        <SelectItem value="05">05</SelectItem>
                        <SelectItem value="06">06</SelectItem>
                        <SelectItem value="07">07</SelectItem>
                        <SelectItem value="08">08</SelectItem>
                        <SelectItem value="09">09</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="11">11</SelectItem>
                        <SelectItem value="12">12</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel for="field-demo-exp-year">Year</FieldLabel>
                  <Select name="field-demo-exp-year">
                    <SelectTrigger id="field-demo-exp-year">
                      <SelectValue placeholder="YYYY" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                        <SelectItem value="2027">2027</SelectItem>
                        <SelectItem value="2028">2028</SelectItem>
                        <SelectItem value="2029">2029</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel for="field-demo-cvv">CVV</FieldLabel>
                  <Input id="field-demo-cvv" placeholder="123" required />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Billing Address</FieldLegend>
            <FieldDescription>
              The billing address associated with your payment method
            </FieldDescription>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox id="field-demo-same-as-shipping" defaultChecked />
                <FieldLabel for="field-demo-same-as-shipping" class={plain}>
                  Same as shipping address
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel for="field-demo-comments">Comments</FieldLabel>
                <Textarea
                  id="field-demo-comments"
                  placeholder="Add any additional comments"
                  class={fixed}
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          <Field orientation="horizontal">
            <Button type="submit">Submit</Button>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
