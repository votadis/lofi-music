const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--mute-audio"]
  });
  const page = await browser.newPage();

  await page.goto("https://votadis.github.io/autoplay/", { waitUntil: "networkidle2" });
  console.log("Main page loaded");

  // List all frames
  const frames = page.frames();
  console.log("Frames count:", frames.length);

  for (const f of frames) {
    console.log("Frame:", f.url());

    // Print main DOM snippet
    try {
      const snippet = await f.evaluate(() => {
        const all = document.body ? document.body.innerHTML.slice(0, 200) : "";
        return all;
      });
      console.log("Frame snippet:", snippet);
    } catch (err) {
      console.log("Could not read frame DOM (likely cross-origin)");
    }
  }

  await browser.close();
})();
