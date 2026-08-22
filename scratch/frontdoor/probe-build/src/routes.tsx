import { route } from "@barqjs/router";
import { loadUser } from "./data.ts";

const Root = (_s: unknown, props: any) => <div id="root">shell:{props.children}</div>;
const Users = (_s: unknown, props: any) => <b id="u">{props.data()?.name}</b>;
const Pending = () => <i>loading</i>;

export const routes = [
  route({
    path: "/",
    component: Root as never,
    children: [
      route({
        path: "users/$id",
        component: Users as never,
        pending: Pending as never,
        loader: async ({ params }: any) => loadUser(params.id),
      }),
    ],
  }),
];
