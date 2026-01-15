const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const SITE_URL = 'https://votadis.github.io/autoplay/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilPlaying(page, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const isPlaying = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) return { found: false };
      return {
        found: true,
        paused: video.paused,
        currentTime: video.currentTime,
        readyState: video.readyState,
        ended: video.ended,
      };
    });

    if (
      isPlaying.found &&
      !isPlaying.paused &&
      !isPlaying.ended &&
      isPlaying.readyState >= 2 &&
      isPlaying.currentTime > 0.5
    ) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--window-size=1280,720',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Page loaded:', SITE_URL);

    const isPlaying = await waitUntilPlaying(page, 15000);

    console.log(isPlaying ? '✅ Video is playing!' : '⚠️ Video not playing.');
  } catch (err) {
    console.error('❌ ERROR:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
