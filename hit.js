const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const SITE_URL = "https://votadis.github.io/autoplay/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPlayerReady(ytFrame) {
  return await ytFrame.evaluate(() => {
    return new Promise((resolve) => {
      function check() {
        if (window.YT && window.YT.Player) {
          resolve(true);
        } else {
          setTimeout(check, 500);
        }
      }
      check();
    });
  });
}

async function waitUntilPlaying(ytFrame, timeoutMs = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = await ytFrame.evaluate(() => {
      const player = document.querySelector(".html5-video-player");
      if (!player || typeof player.getPlayerState !== "function") return -2;
      return player.getPlayerState();
    }).catch(() => -2);

    if (state === 1) return true; // 1 = playing
    await sleep(500);
  }

  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--window-size=1920,1080",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(SITE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    console.log("Page loaded:", SITE_URL);

    const ytFrame = page
      .frames()
      .find((f) =>
        f.url().includes("youtube.com/embed") ||
        f.url().includes("youtube-nocookie.com/embed")
      );

    if (!ytFrame) {
      console.log("❌ Could not find YouTube iframe.");
      return;
    }

    const isPlaying = await waitUntilPlaying(ytFrame, 15000);
    console.log(isPlaying ? "✅ Video is playing!" : "⚠️ Video not playing.");
  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
