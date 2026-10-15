import { css } from "@barqjs/css";
import { Bluetooth } from "@barqjs/lucide/icons/bluetooth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  DirectionProvider,
} from "@barqjs/ui";

const row = css`
  display: flex;
  gap: calc(var(--spacing) * 4);
`;

const body = css`
  display: contents;
`;

export default function AlertDialogRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <AlertDialog>
          <AlertDialogTrigger>
            <Button variant="outline">إظهار الحوار</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <div dir="rtl" class={body}>
              <AlertDialogHeader>
                <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                <AlertDialogDescription>
                  لا يمكن التراجع عن هذا الإجراء. سيؤدي هذا إلى حذف حسابك نهائيًا من خوادمنا.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction>متابعة</AlertDialogAction>
              </AlertDialogFooter>
            </div>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger>
            <Button variant="outline">إظهار الحوار (صغير)</Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <div dir="rtl" class={body}>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Bluetooth />
                </AlertDialogMedia>
                <AlertDialogTitle>السماح للملحق بالاتصال؟</AlertDialogTitle>
                <AlertDialogDescription>
                  هل تريد السماح لملحق USB بالاتصال بهذا الجهاز؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>عدم السماح</AlertDialogCancel>
                <AlertDialogAction>السماح</AlertDialogAction>
              </AlertDialogFooter>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DirectionProvider>
  );
}
