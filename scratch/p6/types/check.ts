import type { RouteData } from "./gen.d.ts";

// A plain function validator.
const a: RouteData["/a/$id"]["search"] = { page: 1, q: "x" };
const aData: RouteData["/a/$id"]["data"] = { name: "Ada", id: "7" };
// No validator, no loader.
const b: RouteData["/b"]["search"] = { anything: "goes" };
const bData: RouteData["/b"]["data"] = undefined;
// A Standard Schema — must win over `.parse` and give `{ page: number }`.
const std: RouteData["/std"]["search"] = { page: 2 };
// A `.parse` object.
const parseObj: RouteData["/parseobj"]["search"] = { q: "hi" };

// @ts-expect-error the Standard Schema arm wins, so `wrong` is not a key
const stdWrong: RouteData["/std"]["search"] = { wrong: true };
// @ts-expect-error a `.parse` validator types the search
const parseWrong: RouteData["/parseobj"]["search"] = { nope: 1 };
// @ts-expect-error an unreadable loader shape FAILS CLOSED to never
const parseData: RouteData["/parseobj"]["data"] = { rows: [1] };

export { a, aData, b, bData, std, parseObj, stdWrong, parseWrong, parseData };
