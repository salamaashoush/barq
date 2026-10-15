import { css } from "@barqjs/css";
import {
  Button,
  DirectionProvider,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@barqjs/ui";

const fields = css`
  padding-inline: calc(var(--spacing) * 4);
`;

export default function SheetRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Sheet>
          <SheetTrigger>
            <Button variant="outline">فتح</Button>
          </SheetTrigger>
          <SheetContent dir="rtl" side="left">
            <SheetHeader>
              <SheetTitle>تعديل الملف الشخصي</SheetTitle>
              <SheetDescription>
                قم بإجراء تغييرات على ملفك الشخصي هنا. انقر حفظ عند الانتهاء.
              </SheetDescription>
            </SheetHeader>
            <FieldGroup class={fields}>
              <Field>
                <FieldLabel for="sheet-rtl-name">الاسم</FieldLabel>
                <Input id="sheet-rtl-name" defaultValue="Salama Ashoush" />
              </Field>
              <Field>
                <FieldLabel for="sheet-rtl-username">اسم المستخدم</FieldLabel>
                <Input id="sheet-rtl-username" defaultValue="salama" />
              </Field>
            </FieldGroup>
            <SheetFooter>
              <Button type="submit">حفظ التغييرات</Button>
              <SheetClose variant="outline">إغلاق</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </DirectionProvider>
  );
}
