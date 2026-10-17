import { httpHeader, httpStatus } from "@barqjs/web";

export default function NotFound() {
  httpStatus(404);
  httpHeader("cache-control", "no-store");
  return <h1>Not found</h1>;
}
