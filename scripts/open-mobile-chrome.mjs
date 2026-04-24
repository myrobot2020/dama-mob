import { chromium, devices } from "playwright";

function readArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}

const url = readArg("url", "http://localhost:8080/reflect?mobile=1");
const deviceName = readArg("device", "Pixel 5");

const device = devices[deviceName];
if (!device) {
  const known = Object.keys(devices)
    .filter((d) => /pixel|iphone/i.test(d))
    .slice(0, 12);
  throw new Error(
    `Unknown device "${deviceName}". Try one of: ${known.join(", ")} (or pass --device "Pixel 5").`,
  );
}

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
});

const context = await browser.newContext({
  ...device,
});

const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded" });

console.log(`Opened ${url} in Chrome emulation (${deviceName}). Close the browser to exit.`);

await page.waitForEvent("close").catch(() => {});
await browser.close().catch(() => {});

