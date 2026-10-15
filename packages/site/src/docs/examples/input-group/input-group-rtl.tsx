import { css } from "@barqjs/css";
import { Search } from "@barqjs/lucide/icons/search";
import {
  DirectionProvider,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Spinner,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 6);
`;

const narrow = css`
  max-width: 20rem;
`;

const end = css`
  margin-inline-start: auto;
`;

export default function InputGroupRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <InputGroup class={narrow}>
          <InputGroupInput aria-label="بحث" placeholder="بحث..." />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">١٢ نتيجة</InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput aria-label="جاري البحث" placeholder="جاري البحث..." />
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput aria-label="جاري حفظ التغييرات" placeholder="جاري حفظ التغييرات..." />
          <InputGroupAddon align="inline-end">
            <InputGroupText>جاري الحفظ...</InputGroupText>
            <Spinner />
          </InputGroupAddon>
        </InputGroup>
        <FieldGroup>
          <Field>
            <FieldLabel for="input-group-rtl-textarea">منطقة النص</FieldLabel>
            <InputGroup>
              <InputGroupTextarea id="input-group-rtl-textarea" placeholder="اكتب تعليقًا..." />
              <InputGroupAddon align="block-end">
                <InputGroupText>٠/٢٨٠</InputGroupText>
                <InputGroupButton variant="default" size="sm" class={end}>
                  نشر
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>تذييل موضع أسفل منطقة النص.</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    </DirectionProvider>
  );
}
