import {
  DirectionProvider,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@barqjs/ui";

export default function PaginationRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" text="السابق" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">١</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                ٢
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">٣</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" text="التالي" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </DirectionProvider>
  );
}
