import { css } from "@barqjs/css";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DirectionProvider,
  Input,
  Label,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
`;

const fields = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const field = css`
  display: grid;
  gap: calc(var(--spacing) * 2);
`;

const labelRow = css`
  display: flex;
  align-items: center;
`;

const forgot = css`
  margin-inline-start: auto;
  display: inline-block;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: inherit;
  text-decoration: none;
  text-underline-offset: 4px;

  &:hover {
    text-decoration: underline;
  }
`;

const footer = css`
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const full = css`
  width: 100%;
`;

export default function CardRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Card>
          <CardHeader>
            <CardTitle>تسجيل الدخول إلى حسابك</CardTitle>
            <CardDescription>أدخل بريدك الإلكتروني أدناه لتسجيل الدخول إلى حسابك</CardDescription>
            <CardAction>
              <Button variant="link">إنشاء حساب</Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event: SubmitEvent) => event.preventDefault()}>
              <div class={fields}>
                <div class={field}>
                  <Label for="card-rtl-email">البريد الإلكتروني</Label>
                  <Input
                    id="card-rtl-email"
                    type="email"
                    placeholder="salama@example.com"
                    required
                  />
                </div>
                <div class={field}>
                  <div class={labelRow}>
                    <Label for="card-rtl-password">كلمة المرور</Label>
                    <a href="#" class={forgot}>
                      نسيت كلمة المرور؟
                    </a>
                  </div>
                  <Input id="card-rtl-password" type="password" required />
                </div>
              </div>
            </form>
          </CardContent>
          <CardFooter class={footer}>
            <Button type="submit" class={full}>
              تسجيل الدخول
            </Button>
            <Button variant="outline" class={full}>
              تسجيل الدخول باستخدام Google
            </Button>
          </CardFooter>
        </Card>
      </div>
    </DirectionProvider>
  );
}
