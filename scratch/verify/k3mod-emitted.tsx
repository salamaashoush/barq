import { esc as _$esc, html as _$html, block as _$block, boundary as _$boundary } from "/home/sashoush/Workspace/barq/packages/server/src/index.ts";
import { computed } from "/home/sashoush/Workspace/barq/packages/core/src/index.ts";
export const state = { calls: 0 };
export default function Page(_s$) {
  const data = computed(async () => {
    state.calls++;
    await new Promise((r) => setTimeout(r, 5));
    return "Ada";
  }, { key: "r:/users/$id|{id:7}" });
  return _$html(`<main>${_$boundary(_s$, null, null, "loading", _$block((_s$) => _$html(`<i>loading</i>`)), _$block((_s$) => _$html(`<b>${_$esc(data())}</b>`)))}</main>`);
}
Page = _$block(Page);
