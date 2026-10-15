import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Archive } from "@barqjs/lucide/icons/archive";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { CalendarPlus } from "@barqjs/lucide/icons/calendar-plus";
import { Clock } from "@barqjs/lucide/icons/clock";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { ListFilter } from "@barqjs/lucide/icons/list-filter";
import { MailCheck } from "@barqjs/lucide/icons/mail-check";
import { Tag } from "@barqjs/lucide/icons/tag";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import {
  Button,
  ButtonGroup,
  DirectionProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const back = css`
  display: none;

  @media (min-width: 40rem) {
    display: flex;
  }
`;

const arrow = css`
  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

const menu = css`
  width: calc(var(--spacing) * 40);
`;

export default function ButtonGroupRtl() {
  const [label, setLabel] = createSignal("personal");

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <ButtonGroup>
          <ButtonGroup class={back}>
            <Button variant="outline" size="icon" aria-label="Go Back">
              <ArrowLeft class={arrow} />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant="outline">أرشفة</Button>
            <Button variant="outline">تقرير</Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant="outline">تأجيل</Button>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" size="icon" aria-label="More Options">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class={menu}>
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <MailCheck />
                    وضع علامة كمقروء
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Archive />
                    أرشفة
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Clock />
                    تأجيل
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CalendarPlus />
                    إضافة إلى التقويم
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ListFilter />
                    إضافة إلى القائمة
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Tag />
                      تصنيف كـ...
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup value={label()} onValueChange={setLabel}>
                        <DropdownMenuRadioItem value="personal">شخصي</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="work">عمل</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="other">آخر</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive">
                    <Trash2 />
                    سلة المهملات
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </ButtonGroup>
      </div>
    </DirectionProvider>
  );
}
