import { getUser } from "../data/users.ts";
export const loader = async ({ params }: { params: { id: string } }) => getUser(params.id);
export const Component = () => "user";
