import { lazy } from "@barqjs/core";
const Home = lazy(() => import("./routes/index.tsx"));
const User = lazy(() => import("./routes/users.$id.tsx"));
export const routes = [
  { id: "/", path: "/", component: Home },
  { id: "/users/$id", path: "/users/$id", component: User },
];
console.log(routes.length);
