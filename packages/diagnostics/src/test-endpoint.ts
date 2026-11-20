import type { EndpointRequest, EndpointResponse } from "./vite.ts";

export function request(method: string, url: string, body?: string): EndpointRequest {
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      // Two chunks, split inside the text, as a socket may deliver it.
      if (body !== undefined) {
        const bytes = new TextEncoder().encode(body);
        const half = Math.floor(bytes.length / 2);
        yield bytes.subarray(0, half);
        yield bytes.subarray(half);
      }
    },
  };
}

export interface Recorded extends EndpointResponse {
  headers: Record<string, string>;
  body: string;
  json(): unknown;
}

export function recorder(): Recorded {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body = "") {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body) as unknown;
    },
  };
}
