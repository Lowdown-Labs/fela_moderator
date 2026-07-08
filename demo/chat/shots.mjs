import { chromium } from "playwright";

const BASE = "http://localhost:4174";
const OUT = new URL("./shots/", import.meta.url).pathname;
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL " + msg);
    process.exit(1);
  }
  console.log("ok   " + msg);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle" });

const box = page.getByRole("textbox");

// 01 clean
await box.fill("On my way, thanks!");
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + "01-clean.png" });
assert((await box.getAttribute("data-blocked")) === "false", "clean state not blocked");

// 02 highlighted — the demo runs default block/block; typing a phone highlights the span inline
await box.fill("call me at 415-555-0199");
await page.waitForTimeout(300);
assert((await page.locator('mark[part="finding"]').count()) > 0, "phone highlighted");
await page.screenshot({ path: OUT + "02-highlighted.png" });

// 03 dialog — click Send to open the resolver dialog
await page.getByRole("button", { name: "Send" }).click();
await page.waitForTimeout(200);
assert(await page.getByText(/looks personal/i).isVisible(), "resolver dialog visible");
await page.screenshot({ path: OUT + "03-dialog.png" });

// 04 redacted result — choose Redact & send, assert the phone is masked in the transcript
await page.getByRole("button", { name: /redact/i }).click();
await page.waitForTimeout(300);
assert(!(await page.locator("main").innerText()).includes("415-555-0199"), "phone redacted in transcript");
await page.screenshot({ path: OUT + "04-redacted.png" });

await browser.close();
console.log("\nALL SHOTS OK");
