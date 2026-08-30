import { createFileRoute } from "@barqjs/router";

export const Route = createFileRoute("/shop/")({
  component: () => <p id="shop-index">the shop</p>,
});
