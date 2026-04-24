import { chromium } from "playwright";
import fs from "fs";
import path from "path";

(async () => {
  const bravePath = path.join(process.env.PROGRAMFILES, "BraveSoftware\\Brave-Browser\\Application\\brave.exe");
  // This points to your actual Brave login session
  const userDataDir = path.join(process.env.LOCALAPPDATA, "BraveSoftware\\Brave-Browser\\User Data");

  console.log("Launching Brave with your profile...");
  console.log("IMPORTANT: Close all other Brave windows first!");

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: bravePath,
    headless: false,
    viewport: null, // Use full screen
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto("https://chatgpt.com");

  console.log("Waiting for sidebar...");
  const nav = await page.waitForSelector('nav', { timeout: 60000 });

  await page.evaluate(async () => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const scrollable = Array.from(document.querySelector('nav').querySelectorAll('*')).find(el => {
      const style = window.getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    });

    if (!scrollable) return;

    let lastHeight = scrollable.scrollHeight;
    let noChangeCount = 0;
    while (noChangeCount < 4) {
      scrollable.scrollTo(0, scrollable.scrollHeight);
      let changed = false;
      for (let i = 0; i < 15; i++) {
        await delay(200);
        if (scrollable.scrollHeight > lastHeight) { changed = true; break; }
      }
      if (!changed) {
        noChangeCount++;
        scrollable.scrollBy(0, -20);
        await delay(200);
        scrollable.scrollTo(0, scrollable.scrollHeight);
      } else {
        noChangeCount = 0;
        lastHeight = scrollable.scrollHeight;
      }
    }
    alert("Pagination complete!");
  });

  console.log("Finished.");
})();
