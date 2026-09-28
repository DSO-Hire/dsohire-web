import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyContact, sanitizeRecord } from "./leads";

test("classifyContact: emails normalize to lowercase", () => {
  assert.deepEqual(classifyContact("  Ops@BridgewayDental.com "), {
    type: "email",
    value: "ops@bridgewaydental.com",
  });
});

test("classifyContact: rejects malformed emails", () => {
  assert.equal(classifyContact("ops@bridgeway"), null);
  assert.equal(classifyContact("@x.com"), null);
  assert.equal(classifyContact("a b@c.com"), null);
});

test("classifyContact: US phones in any common format", () => {
  for (const raw of ["(312) 555-0147", "312.555.0147", "312 555 0147", "+1 312-555-0147", "13125550147"]) {
    assert.deepEqual(classifyContact(raw), { type: "phone", value: "+13125550147" }, raw);
  }
});

test("classifyContact: rejects short numbers and free text", () => {
  assert.equal(classifyContact("555-0147"), null);
  assert.equal(classifyContact("call me maybe"), null);
  assert.equal(classifyContact("312555014x"), null);
  assert.equal(classifyContact(""), null);
});

test("sanitizeRecord: keeps flat primitives, drops objects, clips strings", () => {
  const out = sanitizeRecord(
    { a: "x".repeat(900), b: 3, c: true, d: null, e: { nested: 1 }, f: Number.NaN },
    24,
    500
  );
  assert.equal((out.a as string).length, 500);
  assert.equal(out.b, 3);
  assert.equal(out.c, true);
  assert.equal(out.d, null);
  assert.ok(!("e" in out));
  assert.ok(!("f" in out));
});
