import { css } from "@barqjs/css";
import {
  Field,
  FieldLabel,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barqjs/ui";

const bar = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
`;

const fit = css`
  width: fit-content;
`;

const narrow = css`
  width: calc(var(--spacing) * 20);
`;

const pager = css`
  margin-inline: 0;
  width: auto;
`;

export default function PaginationIconsOnly() {
  return (
    <div class={bar}>
      <Field orientation="horizontal" class={fit}>
        <FieldLabel for="pagination-icons-only-rows">Rows per page</FieldLabel>
        <Select name="pagination-icons-only-rows" defaultValue="25">
          <SelectTrigger class={narrow} id="pagination-icons-only-rows">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Pagination class={pager}>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
