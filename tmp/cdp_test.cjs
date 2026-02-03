(async () => {
  try {
    const { chromium } = require("playwright-core");
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 });

    const title = await page.title();
    const url = page.url();

    console.log(`Success: Title='${title}', URL='${url}'`);

    if (typeof browser.disconnect === "function") {
      await browser.disconnect();
    } else {
      await browser.close();
    }
    process.exit(0);
  } catch (e) {
    console.log("ERRO_NO_TESTE:", e && e.message ? e.message : String(e));
    process.exit(1);
  }
})();
