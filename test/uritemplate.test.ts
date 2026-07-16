import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchUriTemplate,
  expandUriTemplate,
  templateVariables,
  isUriTemplate,
} from "../src/uritemplate.js";

test("matchUriTemplate extracts a single variable", () => {
  assert.deepEqual(matchUriTemplate("greeting://{who}", "greeting://ada"), {
    who: "ada",
  });
});

test("matchUriTemplate extracts multiple variables in order", () => {
  assert.deepEqual(
    matchUriTemplate("file:///{dir}/{name}", "file:///etc/hosts"),
    { dir: "etc", name: "hosts" }
  );
});

test("matchUriTemplate returns null when the literal prefix differs", () => {
  assert.equal(matchUriTemplate("greeting://{who}", "other://ada"), null);
});

test("matchUriTemplate variable does not span a path separator", () => {
  // {who} matches [^/]+, so a slash prevents a match against a single-var template.
  assert.equal(matchUriTemplate("greeting://{who}", "greeting://a/b"), null);
});

test("matchUriTemplate percent-decodes captured values", () => {
  assert.deepEqual(
    matchUriTemplate("greeting://{who}", "greeting://Ada%20Lovelace"),
    { who: "Ada Lovelace" }
  );
});

test("matchUriTemplate escapes regex metacharacters in the literal parts", () => {
  // The '.' and '?' are literals here, not regex wildcards.
  assert.deepEqual(matchUriTemplate("q://a.b/{x}?", "q://a.b/1?"), { x: "1" });
  assert.equal(matchUriTemplate("q://a.b/{x}?", "q://aXb/1?"), null);
});

test("matchUriTemplate tolerates malformed percent-encoding", () => {
  const got = matchUriTemplate("g://{v}", "g://%zz");
  assert.deepEqual(got, { v: "%zz" });
});

test("matchUriTemplate returns null for non-string inputs", () => {
  // @ts-expect-error deliberate wrong type
  assert.equal(matchUriTemplate(123, "g://x"), null);
});

test("expandUriTemplate substitutes and percent-encodes values", () => {
  assert.equal(
    expandUriTemplate("greeting://{who}", { who: "Ada Lovelace" }),
    "greeting://Ada%20Lovelace"
  );
});

test("expandUriTemplate coerces non-string values", () => {
  assert.equal(expandUriTemplate("n://{id}", { id: 42 }), "n://42");
  assert.equal(expandUriTemplate("n://{flag}", { flag: true }), "n://true");
});

test("expandUriTemplate round-trips with matchUriTemplate", () => {
  const uri = expandUriTemplate("file:///{dir}/{name}", {
    dir: "a b",
    name: "c/d",
  });
  const back = matchUriTemplate("file:///{dir}/{name}", uri);
  assert.deepEqual(back, { dir: "a b", name: "c/d" });
});

test("expandUriTemplate throws on a missing variable", () => {
  assert.throws(
    () => expandUriTemplate("greeting://{who}", {}),
    /missing template variable: who/
  );
});

test("templateVariables lists names in first-seen order without duplicates", () => {
  assert.deepEqual(templateVariables("x://{a}/{b}/{a}"), ["a", "b"]);
});

test("templateVariables is empty for a plain URI", () => {
  assert.deepEqual(templateVariables("info://readme"), []);
});

test("isUriTemplate distinguishes templates from plain URIs", () => {
  assert.equal(isUriTemplate("greeting://{who}"), true);
  assert.equal(isUriTemplate("info://readme"), false);
});
