const puppeteer = require("puppeteer");

const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("Script starting...");
console.log("Node version:", process.version);

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
  try {
    const iframeHandle = await frame.frameElement();
    if (!iframeHandle) {
      console.log("Could not get iframe element handle");
      return null;
    }

    await iframeHandle.evaluate((el) =>
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
    );

    const box = await iframeHandle.boundingBox();
    if (!box) {
      console.log("Iframe bounding box not available");
      return null;
    }

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.click(cx, cy, { delay: 100 });
    await sleep(300);
    await page.mouse.click(cx, cy, { delay: 100 });
    
    return { cx, cy };
  } catch (err) {
    console.log("Error clicking iframe center:", err.message);
    return null;
  }
}

async function tryStartPlayback(page, ytFrame) {
  console.log("Attempting playback strategies...");

  // Strategy 1: JavaScript play
  try {
    console.log("Trying JS play...");
    const result = await ytFrame.evaluate(async () => {
      const v = document.querySelector("video");
      if (!v) return { success: false, reason: "no video element" };

      try {
        v.muted = false;
        v.volume = 1.0;
        const playPromise = v.play();
        if (playPromise !== undefined) {
          await playPromise;
          return { success: true, method: "video.play() unmuted" };
        }
      } catch (err) {
        v.muted = true;
        try {
          await v.play();
          return { success: true, method: "video.play() muted" };
        } catch (mutedErr) {
          return { success: false, reason: err.message };
        }
      }
      return { success: false, reason: "unknown" };
    });

    if (result.success) {
      console.log("✓ JS play succeeded:", result.method);
      await sleep(1000);
      return result.method;
    } else {
      console.log("✗ JS play failed:", result.reason);
    }
  } catch (err) {
    console.log("✗ JS play error:", err.message);
  }

  // Strategy 2: Large play button
  try {
    console.log("Trying large play button...");
    const button = await ytFrame.waitForSelector("button.ytp-large-play-button", { timeout: 3000 });
    if (button) {
      await ytFrame.click("button.ytp-large-play-button", { delay: 100 });
      await sleep(500);
      await ytFrame.click("button.ytp-large-play-button", { delay: 100 });
      console.log("✓ Clicked large play button");
      await sleep(1000);
      return "clicked play button";
    }
  } catch (err) {
    console.log("✗ Large play button not found or error:", err.message);
  }

  // Strategy 3: Click iframe center
  try {
    console.log("Trying iframe center click...");
    const result = await clickIframeCenter(page, ytFrame);
    if (result) {
      console.log("✓ Clicked iframe center at", result);
      await sleep(1000);
      return "clicked iframe center";
    }
  } catch (err) {
    console.log("✗ Iframe center click error:", err.message);
  }

  return "all methods attempted";
}

async function waitUntilPlaying(ytFrame, timeoutMs = 25000) {
  console.log("Checking if video is playing...");
  const start = Date.now();
  let checks = 0;

  while (Date.now() - start < timeoutMs) {
    try {
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

      checks++;
      if (checks % 4 === 0) {
        console.log(`Check #${checks}: time=${state.currentTime?.toFixed(2)}s, paused=${state.paused}, ready=${state.readyState}`);
      }

      if (state.hasVideo && state.currentTime > 0 && !state.paused && !state.ended) {
        console.log(`Video is playing at ${state.currentTime.toFixed(2)}s`);
        return true;
      }

      await sleep(500);
    } catch (err) {
      console.log("Error checking playback state:", err.message);
      await sleep(500);
    }
  }

  return false;
}

(async () => {
  let browser;
  
  try {
    console.log("Launching browser...");
    
    browser = await puppeteer.launch({
      headless: true, // Using true for CI/CD environments
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--window-size=1280,800",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // Important for some CI environments
        "--disable-blink-features=AutomationControlled",
      ],
      dumpio: true, // Show browser console logs
    }).catch(err => {
      console.error("Failed to launch browser:", err);
      throw err;
    });

    console.log("Browser launched successfully");

    const page = await browser.newPage();
    console.log("New page created");
    
    await page.setViewport({ width: 1280, height: 800 });
    console.log("Viewport set");
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    console.log("User agent set");

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log("Navigating to:", NOTION_URL);
    await page.goto(NOTION_URL, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    }).catch(err => {
      console.error("Navigation failed:", err);
      throw err;
    });
    
    console.log("Page loaded successfully");

    console.log("Waiting for YouTube iframe...");
    const ytFrame = await waitForYouTubeFrame(page, 90000);
    
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found (timed out)");
      return;
    }

    console.log("✅ YouTube frame found:", ytFrame.url());
    await sleep(2000);

    const method = await tryStartPlayback(page, ytFrame);
    console.log("Playback attempt completed. Method:", method);

    const isPlaying = await waitUntilPlaying(ytFrame, 30000);

    if (isPlaying) {
      console.log("✅✅✅ Playback confirmed! Video is running.");
      console.log("Keeping video active for 30 minutes...");
      await sleep(30 * 60 * 1000);
      console.log("30 minutes completed. Exiting.");
    } else {
      console.log("⚠️ Could not confirm playback");
      console.log("Video may be blocked by autoplay policy or requires manual interaction");
      // Still keep it running for a while
      console.log("Keeping session active for 5 minutes anyway...");
      await sleep(5 * 60 * 1000);
    }

  } catch (err) {
    console.error("❌ FATAL ERROR:", err);
    console.error("Stack trace:", err.stack);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed");
    }
    console.log("Script finished");
  }
})();
