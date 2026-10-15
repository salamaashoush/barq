import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Dot } from "@barqjs/lucide/icons/dot";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  DirectionProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const trigger = css`
  display: flex;
  align-items: center;
  gap: var(--spacing);
`;

export default function BreadcrumbRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">الرئيسية</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <Dot />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={(menu) => (
                    <button {...menu.props} ref={menu.ref} class={trigger}>
                      المكونات
                      <ChevronDown size={14} />
                    </button>
                  )}
                />
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuItem>التوثيق</DropdownMenuItem>
                    <DropdownMenuItem>السمات</DropdownMenuItem>
                    <DropdownMenuItem>جيت هاب</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <Dot />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>مسار التنقل</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </DirectionProvider>
  );
}
