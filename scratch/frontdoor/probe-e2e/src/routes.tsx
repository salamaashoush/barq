import { route } from "@barqjs/router";

export function Root(props: any) {
  return <div id="root">shell:{props.children}</div>;
}

export function Users(props: any) {
  return <b id="u">{() => props.data()?.name}</b>;
}

export function Pending() {
  return <i>loading</i>;
}

export const routes = [
  route({
    path: "/",
    component: Root as never,
    children: [
      route({
        path: "users/$id",
        component: Users as never,
        pending: Pending as never,
        loader: async ({ params }: any) => {
          const g = globalThis as any;
          g.__LOADER_CALLS__ = (g.__LOADER_CALLS__ ?? 0) + 1;
          await new Promise((r) => setTimeout(r, 30));
          return { name: `Ada ${params.id}` };
        },
      }),
    ],
  }),
];
