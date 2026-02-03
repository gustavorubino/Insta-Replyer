(async () => {
  try {
    const { chromium } = require("playwright-core");

    const CDP = process.env.CDP_ENDPOINT || "http://127.0.0.1:9222";
    const target = process.argv[2] || "https://example.com";

    const browser = await chromium.connectOverCDP(CDP);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });

    const title = await page.title();
    const url = page.url();

    console.log(`Success: Title='${title}', URL='${url}'`);

    if (typeof browser.disconnect === "function") await browser.disconnect();
    else await browser.close();

    process.exit(0);
  } catch (e) {
    console.log("ERRO_NO_TESTE:", e && e.message ? e.message : String(e));
    process.exit(1);
  }
})();
