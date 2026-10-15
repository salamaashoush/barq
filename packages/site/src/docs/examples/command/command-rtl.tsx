import { css } from "@barqjs/css";
import { Calculator } from "@barqjs/lucide/icons/calculator";
import { Calendar } from "@barqjs/lucide/icons/calendar";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { FaceSlightlySmiling } from "@barqjs/lucide/icons/face-slightly-smiling";
import { Settings } from "@barqjs/lucide/icons/settings";
import { User } from "@barqjs/lucide/icons/user";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  DirectionProvider,
} from "@barqjs/ui";

const palette = css`
  max-width: 24rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
`;

export default function CommandRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Command class={palette} aria-label="الأوامر">
          <CommandInput placeholder="اكتب أمرًا أو ابحث..." />
          <CommandList>
            <CommandEmpty>لم يتم العثور على نتائج.</CommandEmpty>
            <CommandGroup heading="اقتراحات">
              <CommandItem>
                <Calendar />
                <span>التقويم</span>
              </CommandItem>
              <CommandItem>
                <FaceSlightlySmiling />
                <span>البحث عن الرموز التعبيرية</span>
              </CommandItem>
              <CommandItem disabled>
                <Calculator />
                <span>الآلة الحاسبة</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="الإعدادات">
              <CommandItem>
                <User />
                <span>الملف الشخصي</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <CreditCard />
                <span>الفوترة</span>
                <CommandShortcut>⌘B</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Settings />
                <span>الإعدادات</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </DirectionProvider>
  );
}
