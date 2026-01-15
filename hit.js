const puppeteer = require("puppeteer");

const NOTION_URL =
  "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";

async function waitForYouTubeFrame(page, timeoutMs = 60000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const frame = page
      .frames()
      .find((f) => /youtube\.com|youtu\.be/i.test(f.url()) && f.url() !== "about:blank");

    if (frame) return frame;
    await page.waitForTimeout(500);
  }

  return null;
}

async function clickIframeCenter(page, frame) {
  const iframeHandle = await frame.frameElement(); // element handle for the <iframe> on the page
  if (!iframeHandle) throw new Error("Could not get iframe element handle from frame.");

  await iframeHandle.evaluate((el) =>
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
  );

  const box = await iframeHandle.boundingBox();
  if (!box) throw new Error("Iframe bounding box not available (maybe not visible yet).");

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Click on the iframe area to focus it / trigger gesture
  await page.mouse.click(cx, cy, { delay: 50 });

  return { cx, cy };
}

async function tryStartPlayback(page, ytFrame) {
  // 1) Try the large YouTube play button inside the frame (most reliable)
  try {
    await ytFrame.waitForSelector("button.ytp-large-play-button", { timeout: 7000 });
    await ytFrame.click("button.ytp-large-play-button", { delay: 50 });
    return true;
  } catch (_) {}

  // 2) Fallback: click the center of the iframe on the parent page
  await clickIframeCenter(page, ytFrame);

  // 3) Fallback: press "k" (YouTube play/pause) after focusing
  try {
    await page.keyboard.press("k");
  } catch (_) {}

  return true;
}

async function waitUntilPlaying(ytFrame, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const playing = await ytFrame.evaluate(() => {
      const v = document.querySelector("video");
      if (!v) return false;
      return !v.paused && !v.ended && v.readyState >= 2;
    });

    if (playing) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,800",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.goto(NOTION_URL, { waitUntil: "networkidle2", timeout: 60000 });

    // Notion pages can have many iframes; wait until a YouTube one exists.
    const ytFrame = await waitForYouTubeFrame(page, 90000);
    if (!ytFrame) {
      console.log("YouTube iframe not found (timed out).");
      return;
    }

    console.log("YouTube frame URL:", ytFrame.url());

    await tryStartPlayback(page, ytFrame);

    const isPlaying = await waitUntilPlaying(ytFrame, 20000);
    console.log(isPlaying ? "Playback started ✅" : "Playback not confirmed ⚠️ (may be blocked/consent)");

    // Stay open for 30 minutes
    await page.waitForTimeout(30 * 60 * 1000);
  } catch (err) {
    console.error("ERROR:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
