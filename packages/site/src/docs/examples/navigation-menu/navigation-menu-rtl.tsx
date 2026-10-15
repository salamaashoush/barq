import { For, type Child, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  DirectionProvider,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@barqjs/ui";

const components: { title: string; href: string; description: string }[] = [
  {
    title: "حوار التنبيه",
    href: "/docs/components/alert-dialog",
    description: "حوار نافذة يقطع المستخدم بمحتوى مهم ويتوقع استجابة.",
  },
  {
    title: "بطاقة التحويم",
    href: "/docs/components/hover-card",
    description: "للمستخدمين المبصرين لمعاينة المحتوى المتاح خلف الرابط.",
  },
  {
    title: "التقدم",
    href: "/docs/components/progress",
    description: "يعرض مؤشرًا يوضح تقدم إتمام المهمة، عادةً يتم عرضه كشريط تقدم.",
  },
  {
    title: "منطقة التمرير",
    href: "/docs/components/scroll-area",
    description: "يفصل المحتوى بصريًا أو دلاليًا.",
  },
  {
    title: "التبويبات",
    href: "/docs/components/tabs",
    description:
      "مجموعة من أقسام المحتوى المتعددة الطبقات—المعروفة بألواح التبويب—التي يتم عرضها واحدة في كل مرة.",
  },
  {
    title: "تلميح",
    href: "/docs/components/tooltip",
    description:
      "نافذة منبثقة تعرض معلومات متعلقة بعنصر عندما يتلقى العنصر التركيز على لوحة المفاتيح أو عند تحويم الماوس فوقه.",
  },
];

const single = css`
  width: calc(var(--spacing) * 96);
`;

const wide = css`
  display: none;

  @media (width >= 48rem) {
    display: flex;
  }
`;

const grid = css`
  display: grid;
  width: 400px;
  gap: calc(var(--spacing) * 2);

  @media (width >= 48rem) {
    width: 500px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (width >= 64rem) {
    width: 600px;
  }
`;

const body = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const heading = css`
  line-height: 1;
  font-weight: 500;
`;

const summary = css`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--muted-foreground);
`;

function ListItem(props: Incoming<{ title: string; href: string; children?: Child }>) {
  return (
    <li>
      <NavigationMenuLink href={props.href()}>
        <div class={body}>
          <div class={heading}>{props.title()}</div>
          <div class={summary}>{props.children}</div>
        </div>
      </NavigationMenuLink>
    </li>
  );
}

export default function NavigationMenuRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>البدء</NavigationMenuTrigger>
              <NavigationMenuContent dir="rtl">
                <ul class={single}>
                  <ListItem href="/docs/components" title="مقدمة">
                    مكونات قابلة لإعادة الاستخدام مبنية باستخدام @barqjs/css.
                  </ListItem>
                  <ListItem href="/docs/installation" title="التثبيت">
                    كيفية تثبيت التبعيات وتنظيم تطبيقك.
                  </ListItem>
                  <ListItem href="/docs/components/typography" title="الطباعة">
                    أنماط للعناوين والفقرات والقوائم...إلخ
                  </ListItem>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem class={wide}>
              <NavigationMenuTrigger>المكونات</NavigationMenuTrigger>
              <NavigationMenuContent dir="rtl">
                <ul class={grid}>
                  <For each={components}>
                    {(component: (typeof components)[number]) => (
                      <ListItem title={component.title} href={component.href}>
                        {component.description}
                      </ListItem>
                    )}
                  </For>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="/docs/components" class={navigationMenuTriggerStyle()}>
                الوثائق
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </DirectionProvider>
  );
}
