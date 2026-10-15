/**
 * seroval, as the codec reaches it through `#serializer`.
 *
 * seroval writes its own helpers onto the wire as the `toString()` of its
 * functions, so their bytes are whatever build of seroval is running. The
 * published build bundles this module MINIFIED, which makes those helpers the
 * minifier's output; in the workspace it is seroval as installed.
 */

export {
  Feature,
  createPlugin,
  crossSerialize,
  crossSerializeStream,
  fromJSON,
  getCrossReferenceHeader,
  serialize,
  toJSON,
} from "seroval";
export type { Plugin, PluginInfo } from "seroval";
