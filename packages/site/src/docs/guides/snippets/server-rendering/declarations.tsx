import { httpHeader, httpStatus } from "@barqjs/core";

export default function NotFound() {
  httpStatus(404);
  httpHeader("cache-control", "no-store");
  return <h1>Not found</h1>;
}
