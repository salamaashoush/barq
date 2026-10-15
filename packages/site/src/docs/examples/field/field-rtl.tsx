import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  Checkbox,
  DirectionProvider,
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
  padding-block: calc(var(--spacing) * 6);
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

interface Option {
  readonly value: string;
  readonly label: string;
}

const months: readonly Option[] = [
  { value: "01", label: "٠١" },
  { value: "02", label: "٠٢" },
  { value: "03", label: "٠٣" },
  { value: "04", label: "٠٤" },
  { value: "05", label: "٠٥" },
  { value: "06", label: "٠٦" },
  { value: "07", label: "٠٧" },
  { value: "08", label: "٠٨" },
  { value: "09", label: "٠٩" },
  { value: "10", label: "١٠" },
  { value: "11", label: "١١" },
  { value: "12", label: "١٢" },
];

const years: readonly string[] = ["2024", "2025", "2026", "2027", "2028", "2029"];

export default function FieldRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <form onSubmit={(event: SubmitEvent) => event.preventDefault()}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>طريقة الدفع</FieldLegend>
              <FieldDescription>جميع المعاملات آمنة ومشفرة</FieldDescription>
              <FieldGroup>
                <Field>
                  <FieldLabel for="field-rtl-card-name">الاسم على البطاقة</FieldLabel>
                  <Input id="field-rtl-card-name" placeholder="سلامة" required />
                </Field>
                <Field>
                  <FieldLabel for="field-rtl-card-number">رقم البطاقة</FieldLabel>
                  <Input id="field-rtl-card-number" placeholder="1234 5678 9012 3456" required />
                  <FieldDescription>أدخل رقم البطاقة المكون من 16 رقمًا</FieldDescription>
                </Field>
                <div class={expiry}>
                  <Field>
                    <FieldLabel for="field-rtl-exp-month">الشهر</FieldLabel>
                    <Select name="field-rtl-exp-month" dir="rtl">
                      <SelectTrigger id="field-rtl-exp-month">
                        <SelectValue placeholder="ش.ش" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <For each={() => months}>
                            {(month: Option) => (
                              <SelectItem value={month.value}>{month.label}</SelectItem>
                            )}
                          </For>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel for="field-rtl-exp-year">السنة</FieldLabel>
                    <Select name="field-rtl-exp-year" dir="rtl">
                      <SelectTrigger id="field-rtl-exp-year">
                        <SelectValue placeholder="YYYY" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <For each={() => years}>
                            {(year: string) => <SelectItem value={year}>{year}</SelectItem>}
                          </For>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel for="field-rtl-cvv">CVV</FieldLabel>
                    <Input id="field-rtl-cvv" placeholder="123" required />
                  </Field>
                </div>
              </FieldGroup>
            </FieldSet>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>عنوان الفوترة</FieldLegend>
              <FieldDescription>عنوان الفوترة المرتبط بطريقة الدفع الخاصة بك</FieldDescription>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox id="field-rtl-same-as-shipping" defaultChecked />
                  <FieldLabel for="field-rtl-same-as-shipping" class={plain}>
                    نفس عنوان الشحن
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldGroup>
                <Field>
                  <FieldLabel for="field-rtl-comments">تعليقات</FieldLabel>
                  <Textarea
                    id="field-rtl-comments"
                    placeholder="أضف أي تعليقات إضافية"
                    class={fixed}
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
            <Field orientation="horizontal">
              <Button type="submit">إرسال</Button>
              <Button variant="outline" type="button">
                إلغاء
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </div>
    </DirectionProvider>
  );
}
