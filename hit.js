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

  await page.mouse.click(cx, cy, { delay: 100 });
  return { cx, cy };
}

async function tryStartPlayback(page, ytFrame) {
  const attempts = [];

  // A) Click large play button
  attempts.push(async () => {
    await ytFrame.waitForSelector("button.ytp-large-play-button", { timeout: 7000 });
    await ytFrame.click("button.ytp-large-play-button", { delay: 100 });
    return "clicked ytp-large-play-button";
  });

  // B) Click center of iframe
  attempts.push(async () => {
    await clickIframeCenter(page, ytFrame);
    return "clicked iframe center";
  });

  // C) Focus + press 'k'
  attempts.push(async () => {
    const iframeHandle = await ytFrame.frameElement();
    await iframeHandle.focus();
    await page.keyboard.press("k");
    return 'pressed "k"';
  });

  // D) Force JS play inside iframe
  attempts.push(async () => {
    const ok = await ytFrame.evaluate(async () => {
      const v = document.querySelector("video");
      if (!v) return false;
      try {
        v.muted = true;
        await v.play();
        return true;
      } catch {
        return false;
      }
    });
    if (!ok) throw new Error("video.play() failed/not available");
    return "called video.play()";
  });

  // E) Try click with page.evaluate (parent frame script)
  attempts.push(async () => {
    const result = await page.evaluate(() => {
      const iframe = document.querySelector("iframe[src*='youtube']");
      if (!iframe) return false;
      const rect = iframe.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      });
      return iframe.dispatchEvent(event);
    });
    if (!result) throw new Error("evaluate click failed");
    return "clicked center from parent frame";
  });

  for (const fn of attempts) {
    try {
      const msg = await fn();
      await sleep(1000);
      return msg;
    } catch (_) {
      continue;
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
    console.log(
      isPlaying
        ? "Playback started ✅"
        : "Playback not confirmed ⚠️ (blocked/consent/loading)"
    );

    await sleep(30 * 60 * 1000);
  } catch (err) {
    console.error("ERROR:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
