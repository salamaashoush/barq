import { css } from "@barqjs/css";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Info } from "@barqjs/lucide/icons/info";
import { Alert, AlertDescription, AlertTitle, DirectionProvider } from "@barqjs/ui";

const stack = css`
  display: grid;
  width: 100%;
  max-width: 28rem;
  align-items: start;
  gap: calc(var(--spacing) * 4);
`;

export default function AlertRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={stack}>
        <Alert>
          <CircleCheck />
          <AlertTitle>تم الدفع بنجاح</AlertTitle>
          <AlertDescription>
            تمت معالجة دفعتك البالغة 29.99 دولارًا. تم إرسال إيصال إلى عنوان بريدك الإلكتروني.
          </AlertDescription>
        </Alert>
        <Alert>
          <Info />
          <AlertTitle>ميزة جديدة متاحة</AlertTitle>
          <AlertDescription>
            لقد أضفنا دعم الوضع الداكن. يمكنك تفعيله في إعدادات حسابك.
          </AlertDescription>
        </Alert>
      </div>
    </DirectionProvider>
  );
}
