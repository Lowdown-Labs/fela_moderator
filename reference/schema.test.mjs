// Run: node reference/schema.test.mjs
import { moderationSchema, zodRefine } from "./schema.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const schema = moderationSchema();
ok(schema["~standard"].version === 1 && schema["~standard"].vendor === "lowdown-moderate", "standard-schema shape");
const bad = schema["~standard"].validate("mail joe@example.com");
ok(Array.isArray(bad.issues) && bad.issues[0].message.includes("EMAIL"), "flagged -> issues with a why");
const good = schema["~standard"].validate("a friendly hello");
ok(good.value === "a friendly hello" && !good.issues, "clean -> { value }");

// zodRefine emits one custom issue per reason
const issues = [];
zodRefine()("mail joe@example.com", { addIssue: (i) => issues.push(i) });
ok(issues.length >= 1 && issues[0].code === "custom" && issues[0].message.includes("EMAIL"), "zodRefine adds custom issues");
const none = [];
zodRefine()("a friendly hello", { addIssue: (i) => none.push(i) });
ok(none.length === 0, "clean -> no zod issues");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
