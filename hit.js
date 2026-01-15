const puppeteer = require("puppeteer");

const NOTION_URL =
  "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForYouTubeFrame(page, timeoutMs = 60000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const frame = page
      .frames()
      .find((f) => /youtube\.com|youtu\.be/i.test(f.url()) && f.url() !== "about:blank");

    if (frame) return frame;
    await sleep(500);
  }

  return null;
}

async function clickIframeCenter(page, frame) {
  const iframeHandle = await frame.frameElement();
  if (!iframeHandle) throw new Error("Could not get iframe element handle from frame.");

  await iframeHandle.evaluate((el) =>
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
  );

  const box = await iframeHandle.boundingBox();
  if (!box) throw new Error("Iframe bounding box not available (maybe not visible yet).");

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.click(cx, cy, { delay: 50 });
  return { cx, cy };
}

async function tryStartPlayback(page, ytFrame) {
  // Try a few strategies; don't throw if one fails.
  const attempts = [];

  // A) Click big play button
  attempts.push(async () => {
    await ytFrame.waitForSelector("button.ytp-large-play-button", { timeout: 7000 });
    await ytFrame.click("button.ytp-large-play-button", { delay: 50 });
    return "clicked ytp-large-play-button";
  });

  // B) Click center of iframe (gesture)
  attempts.push(async () => {
    await clickIframeCenter(page, ytFrame);
    return "clicked iframe center";
  });

  // C) Press "k" to toggle play (after focus)
  attempts.push(async () => {
    await page.keyboard.press("k");
    return 'pressed "k"';
  });

  // D) Force play via JS inside frame (sometimes works even when UI click doesn't)
  attempts.push(async () => {
    const ok = await ytFrame.evaluate(async () => {
      const v = document.querySelector("video");
      if (!v) return false;
      try {
        v.muted = true; // helps autoplay policies
        await v.play();
        return true;
      } catch {
        return false;
      }
    });
    if (!ok) throw new Error("video.play() failed/not available");
    return "called video.play()";
  });

  for (const fn of attempts) {
    try {
      const msg = await fn();
      // small pause to let state update
      await sleep(800);
      return msg;
    } catch (_) {
      // continue
    }
  }

  return "no start method succeeded";
}

async function waitUntilPlaying(ytFrame, timeoutMs = 20000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = await ytFrame.evaluate(() => {
      const v = document.querySelector("video");
      if (!v) return { hasVideo: false };
      return {
        hasVideo: true,
        paused: v.paused,
        ended: v.ended,
        readyState: v.readyState,
        currentTime: v.currentTime,
      };
    });

    // Consider it "playing" if video exists, not ended, and currentTime is moving / not paused.
    if (state.hasVideo && !state.ended && !state.paused && state.readyState >= 2) return true;

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

    const ytFrame = await waitForYouTubeFrame(page, 90000);
    if (!ytFrame) {
      console.log("YouTube iframe not found (timed out).");
      return;
    }

    console.log("YouTube frame URL:", ytFrame.url());

    const used = await tryStartPlayback(page, ytFrame);
    console.log("Start attempt:", used);

    const isPlaying = await waitUntilPlaying(ytFrame, 25000);
    console.log(isPlaying ? "Playback started ✅" : "Playback not confirmed ⚠️ (blocked/consent/loading)");

    // Stay open for 30 minutes (using sleep instead of page.waitForTimeout)
    await sleep(30 * 60 * 1000);
  } catch (err) {
    console.error("ERROR:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
