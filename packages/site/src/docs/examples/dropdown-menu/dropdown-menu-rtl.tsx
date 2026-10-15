import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";
import {
  Button,
  DirectionProvider,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  justify-content: center;
`;

const menu = css`
  width: calc(var(--spacing) * 36);
`;

export default function DropdownMenuRtl() {
  const [showStatusBar, setShowStatusBar] = createSignal(true);
  const [showActivityBar, setShowActivityBar] = createSignal(false);
  const [showPanel, setShowPanel] = createSignal(false);
  const [position, setPosition] = createSignal("bottom");

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline">افتح القائمة</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent dir="rtl" class={menu}>
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>الحساب</DropdownMenuSubTrigger>
                <DropdownMenuSubContent dir="rtl">
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <User />
                      الملف الشخصي
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <CreditCard />
                      الفوترة
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings />
                      الإعدادات
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>الفريق</DropdownMenuLabel>
              <DropdownMenuItem>الفريق</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>دعوة المستخدمين</DropdownMenuSubTrigger>
                <DropdownMenuSubContent dir="rtl">
                  <DropdownMenuItem>البريد الإلكتروني</DropdownMenuItem>
                  <DropdownMenuItem>رسالة</DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>المزيد</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent dir="rtl">
                      <DropdownMenuItem>تقويم</DropdownMenuItem>
                      <DropdownMenuItem>دردشة</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>خطاف ويب</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>متقدم...</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem>
                فريق جديد
                <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>عرض</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={showStatusBar()}
                onCheckedChange={setShowStatusBar}
              >
                شريط الحالة
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showActivityBar()}
                onCheckedChange={setShowActivityBar}
              >
                شريط النشاط
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showPanel()} onCheckedChange={setShowPanel}>
                اللوحة
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>الموضع</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={position()} onValueChange={setPosition}>
                <DropdownMenuRadioItem value="top">أعلى</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="bottom">أسفل</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="right">يمين</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="left">يسار</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive">تسجيل الخروج</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DirectionProvider>
  );
}
