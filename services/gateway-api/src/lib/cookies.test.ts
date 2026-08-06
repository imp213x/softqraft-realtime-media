import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCookies, serializeCookie } from "./cookies.js";

describe("cookies", () => {
  it("parses cookie header", () => {
    const c = parseCookies("sq_admin_session=abc%20123; other=x");
    assert.equal(c.sq_admin_session, "abc 123");
    assert.equal(c.other, "x");
  });

  it("serializes session cookie", () => {
    const s = serializeCookie("sq_admin_session", "tok", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAgeSec: 3600,
    });
    assert.match(s, /sq_admin_session=tok/);
    assert.match(s, /HttpOnly/);
    assert.match(s, /Secure/);
    assert.match(s, /SameSite=Lax/);
    assert.match(s, /Max-Age=3600/);
  });

  it("clears cookie", () => {
    const s = serializeCookie("sq_admin_session", "", { clear: true, httpOnly: true });
    assert.match(s, /Max-Age=0/);
  });
});
