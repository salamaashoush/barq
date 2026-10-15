import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  DirectionProvider,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@barqjs/ui";

const bar = css`
  width: calc(var(--spacing) * 72);
`;

const narrow = css`
  width: calc(var(--spacing) * 44);
`;

export default function MenubarRtl() {
  const [profile, setProfile] = createSignal("mira");

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Menubar class={bar}>
          <MenubarMenu>
            <MenubarTrigger>ملف</MenubarTrigger>
            <MenubarContent dir="rtl">
              <MenubarGroup>
                <MenubarItem>
                  علامة تبويب جديدة <MenubarShortcut>⌘T</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  نافذة جديدة <MenubarShortcut>⌘N</MenubarShortcut>
                </MenubarItem>
                <MenubarItem disabled>نافذة التصفح المتخفي الجديدة</MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarSub>
                  <MenubarSubTrigger>مشاركة</MenubarSubTrigger>
                  <MenubarSubContent dir="rtl">
                    <MenubarGroup>
                      <MenubarItem>رابط البريد الإلكتروني</MenubarItem>
                      <MenubarItem>الرسائل</MenubarItem>
                      <MenubarItem>الملاحظات</MenubarItem>
                    </MenubarGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem>
                  طباعة... <MenubarShortcut>⌘P</MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>تعديل</MenubarTrigger>
            <MenubarContent dir="rtl">
              <MenubarGroup>
                <MenubarItem>
                  تراجع <MenubarShortcut>⌘Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  إعادة <MenubarShortcut>⇧⌘Z</MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarSub>
                  <MenubarSubTrigger>بحث</MenubarSubTrigger>
                  <MenubarSubContent dir="rtl">
                    <MenubarGroup>
                      <MenubarItem>البحث على الويب</MenubarItem>
                    </MenubarGroup>
                    <MenubarSeparator />
                    <MenubarGroup>
                      <MenubarItem>بحث...</MenubarItem>
                      <MenubarItem>البحث التالي</MenubarItem>
                      <MenubarItem>البحث السابق</MenubarItem>
                    </MenubarGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem>قص</MenubarItem>
                <MenubarItem>نسخ</MenubarItem>
                <MenubarItem>لصق</MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>عرض</MenubarTrigger>
            <MenubarContent class={narrow} dir="rtl">
              <MenubarGroup>
                <MenubarCheckboxItem>شريط الإشارات المرجعية</MenubarCheckboxItem>
                <MenubarCheckboxItem defaultChecked>عناوين URL الكاملة</MenubarCheckboxItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem inset>
                  إعادة تحميل <MenubarShortcut>⌘R</MenubarShortcut>
                </MenubarItem>
                <MenubarItem disabled inset>
                  إعادة تحميل قسري <MenubarShortcut>⇧⌘R</MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem inset>تبديل وضع ملء الشاشة</MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem inset>إخفاء الشريط الجانبي</MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>الملفات الشخصية</MenubarTrigger>
            <MenubarContent dir="rtl">
              <MenubarRadioGroup value={profile()} onValueChange={setProfile}>
                <MenubarRadioItem value="salama">Salama</MenubarRadioItem>
                <MenubarRadioItem value="mira">Mira</MenubarRadioItem>
                <MenubarRadioItem value="omar">Omar</MenubarRadioItem>
              </MenubarRadioGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem inset>تعديل...</MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem inset>إضافة ملف شخصي...</MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>
    </DirectionProvider>
  );
}
