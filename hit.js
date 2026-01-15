const puppeteer = require("puppeteer");

const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";
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

  // Multiple clicks to ensure gesture is recognized
  await page.mouse.click(cx, cy, { delay: 100 });
  await sleep(300);
  await page.mouse.click(cx, cy, { delay: 100 });
  
  return { cx, cy };
}

async function handleConsent(ytFrame) {
  try {
    // Handle YouTube consent/cookie dialogs
    const consentSelectors = [
      'button[aria-label*="Accept"]',
      'button[aria-label*="Agree"]',
      '.eom-buttons button:first-child',
      'ytd-button-renderer button',
    ];

    for (const selector of consentSelectors) {
      try {
        await ytFrame.waitForSelector(selector, { timeout: 2000 });
        await ytFrame.click(selector);
        console.log("Clicked consent button");
        await sleep(1000);
        return true;
      } catch (_) {
        continue;
      }
    }
  } catch (_) {
    // No consent dialog found
  }
  return false;
}

async function tryStartPlayback(page, ytFrame) {
  // First handle any consent dialogs
  await handleConsent(ytFrame);

  // Strategy 1: Force unmute and play via JavaScript with proper promise handling
  try {
    const result = await ytFrame.evaluate(async () => {
      const v = document.querySelector("video");
      if (!v) return { success: false, reason: "no video element" };

      try {
        // Unmute and set volume
        v.muted = false;
        v.volume = 1.0;
        
        // Try to play
        const playPromise = v.play();
        if (playPromise !== undefined) {
          await playPromise;
          return { success: true, method: "video.play() unmuted" };
        }
        return { success: false, reason: "play() returned undefined" };
      } catch (err) {
        // If unmuted fails, try muted
        v.muted = true;
        try {
          await v.play();
          return { success: true, method: "video.play() muted" };
        } catch (mutedErr) {
          return { success: false, reason: err.message };
        }
      }
    });

    if (result.success) {
      console.log("Start method:", result.method);
      await sleep(1000);
      return result.method;
    }
  } catch (err) {
    console.log("JS play attempt failed:", err.message);
  }

  // Strategy 2: Click the large play button if visible
  try {
    await ytFrame.waitForSelector("button.ytp-large-play-button", { timeout: 3000 });
    await ytFrame.click("button.ytp-large-play-button", { delay: 100 });
    await sleep(500);
    await ytFrame.click("button.ytp-large-play-button", { delay: 100 });
    console.log("Clicked large play button");
    await sleep(1000);
    return "clicked ytp-large-play-button";
  } catch (_) {
    console.log("No large play button found");
  }

  // Strategy 3: Click center of iframe multiple times
  try {
    await clickIframeCenter(page, ytFrame);
    console.log("Clicked iframe center");
    await sleep(1000);
    return "clicked iframe center";
  } catch (err) {
    console.log("Iframe center click failed:", err.message);
  }

  // Strategy 4: Try keyboard play
  try {
    await page.keyboard.press("k");
    await sleep(500);
    await page.keyboard.press(" ");
    console.log("Pressed keyboard shortcuts");
    await sleep(1000);
    return "pressed keyboard shortcuts";
  } catch (_) {
    // Continue
  }

  return "all start methods attempted";
}

async function waitUntilPlaying(ytFrame, timeoutMs = 25000) {
  const start = Date.now();
  let lastTime = -1;
  let sameTimeCount = 0;

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
        networkState: v.networkState,
      };
    });

    if (state.hasVideo) {
      // Check if currentTime is advancing
      if (state.currentTime > 0 && state.currentTime !== lastTime) {
        console.log(`Video playing at ${state.currentTime.toFixed(2)}s`);
        return true;
      }

      // Check if video is in playing state
      if (!state.paused && !state.ended && state.readyState >= 2) {
        sameTimeCount++;
        if (sameTimeCount > 3) {
          // Video claims to be playing but time not advancing - might be buffering
          console.log("Video state is 'playing' but currentTime not advancing yet...");
        }
      }

      lastTime = state.currentTime;
    }

    await sleep(500);
  }

  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // Changed to false for better compatibility
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,800",
      "--start-maximized",
      // Remove autoplay policy to allow default behavior
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-web-security",
    ],
  });

  try {
    const page = await browser.newPage();
    
    // More realistic viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Better user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Hide automation flags
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log("Navigating to Notion page...");
    await page.goto(NOTION_URL, { waitUntil: "networkidle2", timeout: 60000 });

    console.log("Waiting for YouTube iframe...");
    const ytFrame = await waitForYouTubeFrame(page, 90000);
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found (timed out).");
      return;
    }

    console.log("✅ YouTube frame URL:", ytFrame.url());
    
    // Wait a bit for iframe to fully load
    await sleep(2000);

    console.log("Attempting to start playback...");
    const method = await tryStartPlayback(page, ytFrame);
    console.log("Start attempt result:", method);

    console.log("Waiting for playback confirmation...");
    const isPlaying = await waitUntilPlaying(ytFrame, 30000);

    if (isPlaying) {
      console.log("✅ Playback started successfully!");
      console.log("Keeping video running for 30 minutes...");
      await sleep(30 * 60 * 1000);
    } else {
      console.log("⚠️ Playback not confirmed - video may be blocked by autoplay policy");
      console.log("The browser window will stay open. Try clicking the video manually.");
      // Keep browser open for manual intervention
      await sleep(5 * 60 * 1000);
    }

  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
