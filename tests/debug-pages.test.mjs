// npm test (Node 24 runs the .ts module directly). The developer pages are off unless the flag is on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { debugPagesOn } from "../src/lib/debug-pages.ts";

function withFlag(value, check) {
  const before = process.env.EGOQUANT_DEBUG_PAGES;
  if (value === undefined) delete process.env.EGOQUANT_DEBUG_PAGES;
  else process.env.EGOQUANT_DEBUG_PAGES = value;
  try { check(); } finally {
    if (before === undefined) delete process.env.EGOQUANT_DEBUG_PAGES;
    else process.env.EGOQUANT_DEBUG_PAGES = before;
  }
}

test("off when unset or anything but on/1/true/yes", () => {
  for (const value of [undefined, "", "off", "0", "false", "no", "maybe"]) {
    withFlag(value, () => assert.equal(debugPagesOn(), false, `value ${JSON.stringify(value)}`));
  }
});

test("on with on, 1, true or yes (any case, spaces ignored)", () => {
  for (const value of ["on", "1", "true", "YES", " On "]) {
    withFlag(value, () => assert.equal(debugPagesOn(), true, `value ${JSON.stringify(value)}`));
  }
});
