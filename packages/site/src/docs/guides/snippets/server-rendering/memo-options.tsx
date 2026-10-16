import { Loading, createMemo } from "@barqjs/core";

async function loadName(): Promise<string> {
  return "salama";
}

export default function Account() {
  // The shell waits for this one, so its boundary ships the name and not the fallback.
  const name = createMemo(() => loadName(), { deferStream: true });
  // Never run on the server, which renders `null`; the browser reads its own storage.
  const draft = createMemo(() => localStorage.getItem("draft"), {
    ssrSource: "client",
    loadingValue: null,
  });
  return (
    <Loading fallback={<p>loading</p>}>
      <h1>{name()}</h1>
      <p>{draft() ?? "no draft"}</p>
    </Loading>
  );
}
