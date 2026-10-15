import { css } from "@barqjs/css";

const h1 = css`
  margin: 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  text-wrap: balance;
`;

const lead = css`
  margin: calc(var(--spacing) * 6) 0 0;
  font-size: 1.25rem;
  line-height: 1.75rem;
  color: var(--muted-foreground);
`;

const h2 = css`
  margin: calc(var(--spacing) * 10) 0 0;
  scroll-margin: calc(var(--spacing) * 20);
  border-bottom: 1px solid var(--border);
  padding-bottom: calc(var(--spacing) * 2);
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

const h3 = css`
  margin: calc(var(--spacing) * 8) 0 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

const p = css`
  margin: 0;
  line-height: 1.75rem;

  &:not(:first-child) {
    margin-top: calc(var(--spacing) * 6);
  }
`;

const link = css`
  font-weight: 500;
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 4px;
`;

const blockquote = css`
  margin: calc(var(--spacing) * 6) 0 0;
  border-inline-start: 2px solid var(--border);
  padding-inline-start: calc(var(--spacing) * 6);
  font-style: italic;
`;

const list = css`
  margin-block: calc(var(--spacing) * 6);
  margin-inline-start: calc(var(--spacing) * 6);
  padding: 0;
  list-style-type: disc;

  & > li {
    margin-top: calc(var(--spacing) * 2);
  }
`;

const scroller = css`
  margin-block: calc(var(--spacing) * 6);
  width: 100%;
  overflow-y: auto;
`;

const table = css`
  width: 100%;
  border-collapse: collapse;

  & tr {
    margin: 0;
    border-top: 1px solid var(--border);
    padding: 0;
  }

  & tr:nth-child(even) {
    background-color: var(--muted);
  }

  & th,
  & td {
    border: 1px solid var(--border);
    padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
    text-align: start;
  }

  & th {
    font-weight: 700;
  }
`;

export default function TypographyRtl() {
  return (
    <div dir="rtl">
      <h1 class={h1}>فرض الضرائب على الضحك: سجلات ضريبة النكتة</h1>
      <p class={lead}>
        في قديم الزمان، في أرض بعيدة، كان هناك ملك كسول جداً يقضي يومه كله مستلقياً على عرشه. في أحد
        الأيام، جاءه مستشاروه بمشكلة: المملكة كانت تنفد من المال.
      </p>
      <h2 class={h2}>خطة الملك</h2>
      <p class={p}>
        فكر الملك طويلاً وبجد، وأخيراً توصل إلى{" "}
        <a href="#" class={link}>
          خطة عبقرية
        </a>
        : سيفرض ضريبة على النكات في المملكة.
      </p>
      <blockquote class={blockquote}>
        "في النهاية،" قال، "الجميع يستمتع بنكتة جيدة، لذا من العدل أن يدفعوا مقابل هذا الامتياز."
      </blockquote>
      <h3 class={h3}>ضريبة النكتة</h3>
      <p class={p}>لم يكن رعايا الملك سعداء. تذمروا واشتكوا، لكن الملك كان حازماً:</p>
      <ul class={list}>
        <li>المستوى الأول من التورية: 5 قطع ذهبية</li>
        <li>المستوى الثاني من النكات: 10 قطع ذهبية</li>
        <li>المستوى الثالث من النكات القصيرة: 20 قطعة ذهبية</li>
      </ul>
      <p class={p}>
        نتيجة لذلك، توقف الناس عن رواية النكات، وغرقت المملكة في الكآبة. لكن كان هناك شخص واحد رفض
        أن تحبطه حماقة الملك: مهرج البلاط المسمى المازح.
      </p>
      <h3 class={h3}>ثورة المازح</h3>
      <p class={p}>
        بدأ المازح يتسلل إلى القلعة في منتصف الليل ويترك النكات في كل مكان: تحت وسادة الملك، في
        حسائه، حتى في المرحاض الملكي. كان الملك غاضباً، لكنه لم يستطع إيقاف المازح.
      </p>
      <p class={p}>
        وبعد ذلك، في يوم من الأيام، اكتشف سكان المملكة أن النكات التي تركها المازح كانت مضحكة جداً
        لدرجة أنهم لم يستطيعوا منع أنفسهم من الضحك. وبمجرد أن بدأوا بالضحك، لم يستطيعوا التوقف.
      </p>
      <h3 class={h3}>ثورة الشعب</h3>
      <p class={p}>
        شعر سكان المملكة بالبهجة من الضحك، وبدأوا في رواية النكات والتورية مرة أخرى، وسرعان ما أصبحت
        المملكة بأكملها جزءاً من النكتة.
      </p>
      <div class={scroller}>
        <table class={table}>
          <thead>
            <tr>
              <th>خزينة الملك</th>
              <th>سعادة الشعب</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>فارغة</td>
              <td>فائضة</td>
            </tr>
            <tr>
              <td>متواضعة</td>
              <td>راضٍ</td>
            </tr>
            <tr>
              <td>ممتلئة</td>
              <td>منتشٍ</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class={p}>
        الملك، عندما رأى مدى سعادة رعاياه، أدرك خطأ طرقه وألغى ضريبة النكتة. أُعلن المازح بطلاً، وعاشت
        المملكة في سعادة دائمة.
      </p>
      <p class={p}>مغزى القصة هو: لا تستهن أبداً بقوة الضحك الجيد وكن دائماً حذراً من الأفكار السيئة.</p>
    </div>
  );
}
