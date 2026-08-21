export const validateSearch = (raw: Record<string, unknown>) => ({
  page: Number(raw.page ?? 1),
  q: String(raw.q ?? ""),
});
export const loader = async (ctx: { params: { id: string } }) => ({ name: "Ada", id: ctx.params.id });
export const Component = () => null;
