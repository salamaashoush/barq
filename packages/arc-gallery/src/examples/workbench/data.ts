import type { CheckResult, Problem, TestNode } from "@barqjs/arc";

export const PROBLEMS: Problem[] = [
  {
    id: "1",
    severity: "error",
    message: "Unknown name `totl`",
    location: { uri: "file:///play/src/main.toy", line: 7, column: 9, endColumn: 13 },
    source: "toyc",
    code: "E0425",
    related: [
      {
        message: "A name like it, `total`, is declared here",
        location: { uri: "file:///play/src/main.toy", line: 3, column: 5 },
      },
    ],
  },
  {
    id: "2",
    severity: "warning",
    message: "`step` is assigned but never read",
    location: { uri: "file:///play/src/main.toy", line: 12, column: 5 },
    source: "toyc",
    code: "W0101",
  },
  {
    id: "3",
    severity: "error",
    message: 'Expected a number, found text: `"10"` cannot be added to `count`',
    location: { uri: "file:///play/src/stats.toy", line: 21, column: 18 },
    source: "toyc",
    code: "E0308",
  },
  {
    id: "4",
    severity: "info",
    message: "This loop can be written as `map`",
    location: { uri: "file:///play/src/stats.toy", line: 30, column: 3 },
    source: "toylint",
  },
  {
    id: "5",
    severity: "hint",
    message: "`let` is enough here: the binding is never reassigned",
    location: { uri: "file:///play/lib/list.toy", line: 4, column: 1 },
    source: "toylint",
    code: "prefer-let",
  },
  {
    id: "6",
    severity: "warning",
    message: "Comparing a list with itself is always true",
    location: { uri: "file:///play/lib/list.toy", line: 18, column: 10 },
    source: "toylint",
    code: "self-compare",
  },
];

export const TESTS: TestNode[] = [
  {
    id: "math",
    name: "math",
    location: { uri: "tests/math.toy", line: 1 },
    children: [
      { id: "math/add", name: "adds two numbers", status: "passed", duration: 2 },
      { id: "math/neg", name: "negates zero to zero", status: "passed", duration: 1 },
      {
        id: "math/div",
        name: "divides with a remainder",
        status: "failed",
        duration: 14,
        location: { uri: "tests/math.toy", line: 18 },
        failure: {
          message: "The quotient and remainder differ from what was expected.",
          expected: '{\n  "quotient": 3,\n  "remainder": 1\n}',
          actual: '{\n  "quotient": 3,\n  "remainder": 2\n}',
          language: "json",
          location: { uri: "tests/math.toy", line: 21, column: 3 },
          trace: "at divides with a remainder (tests/math.toy:21:3)\nat run (runner.toy:88:5)",
        },
      },
      { id: "math/pow", name: "raises to a negative power", status: "skipped" },
    ],
  },
  {
    id: "text",
    name: "text",
    location: { uri: "tests/text.toy", line: 1 },
    children: [
      { id: "text/upper", name: "upper-cases ASCII", status: "passed", duration: 3 },
      {
        id: "text/split",
        name: "splits on any whitespace",
        status: "failed",
        duration: 6,
        failure: {
          message: "Expected 3 words but found 4",
          expected: '["one", "two", "three"]',
          actual: '["one", "", "two", "three"]',
          language: "json",
        },
      },
      {
        id: "text/unicode",
        name: "keeps combining marks with their letter",
        children: [
          { id: "text/unicode/nfc", name: "in NFC", status: "running" },
          { id: "text/unicode/nfd", name: "in NFD" },
        ],
      },
    ],
  },
];

export const CHECKS: CheckResult[] = [
  {
    id: "len",
    name: "sort keeps the length of a list",
    verdict: "proved",
    location: { uri: "src/sort.toy", line: 14, column: 1 },
    duration: 84,
  },
  {
    id: "perm",
    name: "sort returns a permutation of its input",
    verdict: "proved",
    location: { uri: "src/sort.toy", line: 18, column: 1 },
    duration: 412,
  },
  {
    id: "stable",
    name: "sort keeps equal keys in their order",
    verdict: "falsified",
    location: { uri: "src/sort.toy", line: 22, column: 1 },
    duration: 37,
    counterexample: {
      xs: [
        { key: 2, tag: "a" },
        { key: 1, tag: "b" },
        { key: 2, tag: "c" },
      ],
      cmp: "by key",
      "result[1].tag": "c",
    },
  },
  {
    id: "merge",
    name: "merge terminates on any two lists",
    verdict: "timeout",
    location: { uri: "src/merge.toy", line: 9, column: 1 },
    message: "Gave up after 10 s without finding a measure that decreases.",
  },
  {
    id: "idem",
    name: "sorting twice is sorting once",
    verdict: "unknown",
    location: { uri: "src/sort.toy", line: 30, column: 1 },
    message: "Needs a lemma about sorted lists; none was given.",
  },
  {
    id: "parse",
    name: "the parser round-trips printed programs",
    verdict: "error",
    location: { uri: "src/parse.toy", line: 52, column: 1 },
    message: "The solver does not support recursive data in quantifiers.",
  },
  {
    id: "empty",
    name: "an empty list is sorted",
    verdict: "vacuous",
    location: { uri: "src/sort.toy", line: 10, column: 1 },
    message: "Holds because its precondition can never be met.",
  },
];
