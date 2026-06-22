import { signImpersonation, verifyImpersonationToken, IMPERSONATION_TTL_MS } from "../src/lib/admin/impersonation";
process.env.IMPERSONATION_COOKIE_SECRET ||= "test-secret-aaaaaaaaaaaaaaaaaaaa";
let pass=0, fail=0;
function ok(n:boolean,m:string){ if(n){pass++;console.log("  ✓ "+m);}else{fail++;console.error("  ✗ "+m);} }
const tok = signImpersonation({adminUserId:"admin-1", targetType:"dso", targetId:"dso-9"})!;
const v = verifyImpersonationToken(tok);
ok(!!v && v.adminUserId==="admin-1" && v.targetType==="dso" && v.targetId==="dso-9", "round-trip verifies");
ok(verifyImpersonationToken(tok+"x")===null, "tampered sig → null");
ok(verifyImpersonationToken("garbage")===null, "garbage → null");
const stale = signImpersonation({adminUserId:"a",targetType:"candidate",targetId:"c", startedAt: Date.now()-IMPERSONATION_TTL_MS-1000})!;
ok(verifyImpersonationToken(stale)===null, "expired (>TTL) → null");
process.env.IMPERSONATION_COOKIE_SECRET="different-secret";
ok(verifyImpersonationToken(tok)===null, "wrong secret → null");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
