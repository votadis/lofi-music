const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const SITE_URL = 'https://votadis.github.io/autoplay/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilPlaying(ytFrame, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const isPlaying = await ytFrame.evaluate(() => {
      const v = document.querySelector('video');
      if (!v) return { found: false };
      return {
        found: true,
        paused: v.paused,
        ended: v.ended,
        currentTime: v.currentTime,
        readyState: v.readyState
      };
    }).catch(() => ({ found: false }));

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
      '--window-size=1920,1080',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Page loaded:', SITE_URL);

    // Find the iframe
    const ytFrame = page
      .frames()
      .find((f) =>
        f.url().includes('youtube.com/embed') ||
        f.url().includes('youtube-nocookie.com/embed')
      );

    if (!ytFrame) {
      console.log('❌ Could not find YouTube iframe.');
      return;
    }

    const isPlaying = await waitUntilPlaying(ytFrame, 15000);

    console.log(isPlaying ? '✅ Video is playing!' : '⚠️ Video not playing.');
  } catch (err) {
    console.error('❌ ERROR:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
