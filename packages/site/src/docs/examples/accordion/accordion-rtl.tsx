import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  DirectionProvider,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 28rem;
`;

interface Entry {
  readonly value: string;
  readonly question: string;
  readonly answer: string;
}

const items: readonly Entry[] = [
  {
    value: "item-1",
    question: "كيف يمكنني إعادة تعيين كلمة المرور؟",
    answer:
      "انقر على 'نسيت كلمة المرور' في صفحة تسجيل الدخول، أدخل عنوان بريدك الإلكتروني، وسنرسل لك رابطًا لإعادة تعيين كلمة المرور. سينتهي صلاحية الرابط خلال 24 ساعة.",
  },
  {
    value: "item-2",
    question: "هل يمكنني تغيير خطة الاشتراك الخاصة بي؟",
    answer:
      "نعم، يمكنك ترقية أو تخفيض خطتك في أي وقت من إعدادات حسابك. ستظهر التغييرات في دورة الفوترة التالية.",
  },
  {
    value: "item-3",
    question: "ما هي طرق الدفع التي تقبلونها؟",
    answer:
      "نقبل جميع بطاقات الائتمان الرئيسية و PayPal والتحويلات المصرفية. تتم معالجة جميع المدفوعات بأمان من خلال شركاء الدفع لدينا.",
  },
];

export default function AccordionRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Accordion type="single" collapsible defaultValue="item-1">
          <For each={() => items}>
            {(item: Entry) => (
              <AccordionItem value={item.value}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            )}
          </For>
        </Accordion>
      </div>
    </DirectionProvider>
  );
}
