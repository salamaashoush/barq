import { css } from "@barqjs/css";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DirectionProvider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
`;

const summary = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function TabsRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="analytics">التحليلات</TabsTrigger>
            <TabsTrigger value="reports">التقارير</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>نظرة عامة</CardTitle>
                <CardDescription>
                  عرض مقاييسك الرئيسية وأنشطة المشروع الأخيرة. تتبع التقدم عبر جميع مشاريعك النشطة.
                </CardDescription>
              </CardHeader>
              <CardContent class={summary}>لديك ١٢ مشروعًا نشطًا و٣ مهام معلقة.</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>التحليلات</CardTitle>
                <CardDescription>
                  تتبع مقاييس الأداء ومشاركة المستخدمين. راقب الاتجاهات وحدد فرص النمو.
                </CardDescription>
              </CardHeader>
              <CardContent class={summary}>
                زادت مشاهدات الصفحة بنسبة ٢٥٪ مقارنة بالشهر الماضي.
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>التقارير</CardTitle>
                <CardDescription>
                  إنشاء وتنزيل تقاريرك التفصيلية. تصدير البيانات بتنسيقات متعددة للتحليل.
                </CardDescription>
              </CardHeader>
              <CardContent class={summary}>لديك ٥ تقارير جاهزة ومتاحة للتصدير.</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>الإعدادات</CardTitle>
                <CardDescription>
                  إدارة تفضيلات حسابك وخياراته. تخصيص تجربتك لتناسب احتياجاتك.
                </CardDescription>
              </CardHeader>
              <CardContent class={summary}>تكوين الإشعارات والأمان والسمات.</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DirectionProvider>
  );
}
