import { css } from "@barqjs/css";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DirectionProvider,
  Field,
  FieldGroup,
  Input,
  Label,
} from "@barqjs/ui";

const narrow = css`
  @media (width >= 40rem) {
    max-width: 24rem;
  }
`;

const body = css`
  display: contents;
`;

export default function DialogRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Dialog>
          <form>
            <DialogTrigger>
              <Button variant="outline">فتح الحوار</Button>
            </DialogTrigger>
            <DialogContent class={narrow}>
              <div dir="rtl" class={body}>
                <DialogHeader>
                  <DialogTitle>تعديل الملف الشخصي</DialogTitle>
                  <DialogDescription>
                    قم بإجراء تغييرات على ملفك الشخصي هنا. انقر فوق حفظ عند الانتهاء.
                  </DialogDescription>
                </DialogHeader>
                <FieldGroup>
                  <Field>
                    <Label for="dialog-rtl-name">الاسم</Label>
                    <Input id="dialog-rtl-name" name="dialog-rtl-name" defaultValue="Salama" />
                  </Field>
                  <Field>
                    <Label for="dialog-rtl-username">اسم المستخدم</Label>
                    <Input
                      id="dialog-rtl-username"
                      name="dialog-rtl-username"
                      defaultValue="@salama"
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <DialogClose>إلغاء</DialogClose>
                  <Button type="submit">حفظ التغييرات</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </form>
        </Dialog>
      </div>
    </DirectionProvider>
  );
}
