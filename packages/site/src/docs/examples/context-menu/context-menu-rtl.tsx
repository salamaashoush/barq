import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { RotateCw } from "@barqjs/lucide/icons/rotate-cw";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DirectionProvider,
} from "@barqjs/ui";

const area = css`
  display: flex;
  aspect-ratio: 16 / 9;
  width: 100%;
  max-width: 20rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xl);
  border: 1px dashed var(--border);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const fine = css`
  display: none;

  @media (pointer: fine) {
    display: inline-block;
  }
`;

const coarse = css`
  display: none;

  @media (pointer: coarse) {
    display: inline-block;
  }
`;

const frame = css`
  display: flex;
  width: 100%;
  justify-content: center;
`;

const menu = css`
  width: calc(var(--spacing) * 48);
`;

const submenu = css`
  width: calc(var(--spacing) * 44);
`;

export default function ContextMenuRtl() {
  const [people, setPeople] = createSignal("salama");

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <ContextMenu>
          <ContextMenuTrigger class={area}>
            <span class={fine}>انقر بزر الماوس الأيمن هنا</span>
            <span class={coarse}>اضغط مطولاً هنا</span>
          </ContextMenuTrigger>
          <ContextMenuContent class={menu} dir="rtl">
            <ContextMenuGroup>
              <ContextMenuSub>
                <ContextMenuSubTrigger>التنقل</ContextMenuSubTrigger>
                <ContextMenuSubContent class={submenu} dir="rtl">
                  <ContextMenuGroup>
                    <ContextMenuItem>
                      <ArrowLeft />
                      رجوع
                      <ContextMenuShortcut>⌘[</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem disabled>
                      <ArrowRight />
                      تقدم
                      <ContextMenuShortcut>⌘]</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <RotateCw />
                      إعادة تحميل
                      <ContextMenuShortcut>⌘R</ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>المزيد من الأدوات</ContextMenuSubTrigger>
                <ContextMenuSubContent class={submenu} dir="rtl">
                  <ContextMenuGroup>
                    <ContextMenuItem>حفظ الصفحة...</ContextMenuItem>
                    <ContextMenuItem>إنشاء اختصار...</ContextMenuItem>
                    <ContextMenuItem>تسمية النافذة...</ContextMenuItem>
                  </ContextMenuGroup>
                  <ContextMenuSeparator />
                  <ContextMenuGroup>
                    <ContextMenuItem>أدوات المطور</ContextMenuItem>
                  </ContextMenuGroup>
                  <ContextMenuSeparator />
                  <ContextMenuGroup>
                    <ContextMenuItem variant="destructive">حذف</ContextMenuItem>
                  </ContextMenuGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuCheckboxItem defaultChecked>
                إظهار الإشارات المرجعية
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem>إظهار عناوين URL الكاملة</ContextMenuCheckboxItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuRadioGroup value={people()} onValueChange={setPeople}>
                <ContextMenuLabel>الأشخاص</ContextMenuLabel>
                <ContextMenuRadioItem value="salama">Salama Ashoush</ContextMenuRadioItem>
                <ContextMenuRadioItem value="mira">Mira Kamal</ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </DirectionProvider>
  );
}
