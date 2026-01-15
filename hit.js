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

// Wrapper to add timeout to frame.evaluate calls
async function evaluateWithTimeout(frame, fn, timeoutMs = 5000) {
  return Promise.race([
    frame.evaluate(fn),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Evaluation timeout')), timeoutMs)
    )
  ]);
}

async function tryStartPlayback(page, ytFrame) {
  console.log("Attempting playback strategies...");

  // Strategy 1: JavaScript play with timeout
  try {
    console.log("Trying JS play...");
    const result = await evaluateWithTimeout(ytFrame, async () => {
      const v = document.querySelector("video");
      if (!v) return { success: false, reason: "no video element" };

      try {
        v.muted = true; // Start muted for better autoplay compatibility
        v.volume = 0;
        
        // Don't await play promise - just trigger it
        const playPromise = v.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => console.log('Play promise rejected:', e.message));
        }
        
        // Check if it started
        return { success: !v.paused, method: "video.play() muted (no await)" };
      } catch (err) {
        return { success: false, reason: err.message };
      }
    }, 3000); // 3 second timeout

    console.log("JS play result:", JSON.stringify(result));
    
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
      console.log("✓ Clicked large play button");
      await sleep(1000);
      return "clicked play button";
    }
  } catch (err) {
    console.log("✗ Large play button not found");
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

  // Strategy 4: Keyboard
  try {
    console.log("Trying keyboard press...");
    await page.keyboard.press("k");
    await sleep(500);
    console.log("✓ Pressed 'k' key");
    return "pressed keyboard";
  } catch (err) {
    console.log("✗ Keyboard press error:", err.message);
  }

  return "all methods attempted";
}

async function waitUntilPlaying(ytFrame, timeoutMs = 20000) {
  console.log("Checking if video is playing...");
  const start = Date.now();
  let checks = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const state = await evaluateWithTimeout(ytFrame, () => {
        const v = document.querySelector("video");
        if (!v) return { hasVideo: false };
        return {
          hasVideo: true,
          paused: v.paused,
          ended: v.ended,
          readyState: v.readyState,
          currentTime: v.currentTime,
          duration: v.duration,
        };
      }, 2000);

      checks++;
      if (checks % 6 === 0 || state.currentTime > 0) {
        console.log(`Check #${checks}: time=${state.currentTime?.toFixed(2)}s, paused=${state.paused}, ready=${state.readyState}`);
      }

      // Video is playing if time > 0 and not paused
      if (state.hasVideo && state.currentTime > 0 && !state.paused && !state.ended) {
        console.log(`✅ Video is playing at ${state.currentTime.toFixed(2)}s`);
        return true;
      }

      await sleep(1000);
    } catch (err) {
      console.log("Error checking playback state:", err.message);
      await sleep(1000);
    }
  }

  return false;
}

(async () => {
  let browser;
  
  try {
    console.log("Launching browser...");
    
    browser = await puppeteer.launch({
      headless: true,
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
        "--single-process",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required", // Allow autoplay
        "--mute-audio", // Mute for autoplay
      ],
      dumpio: false, // Reduced noise
    });

    console.log("Browser launched successfully");

    const page = await browser.newPage();
    console.log("New page created");
    
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log("Navigating to:", NOTION_URL);
    await page.goto(NOTION_URL, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
    console.log("Page loaded successfully");

    console.log("Waiting for YouTube iframe...");
    const ytFrame = await waitForYouTubeFrame(page, 90000);
    
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      return;
    }

    console.log("✅ YouTube frame found:", ytFrame.url());
    await sleep(3000); // Give YouTube more time to load

    const method = await tryStartPlayback(page, ytFrame);
    console.log("Playback attempt completed. Method:", method);

    const isPlaying = await waitUntilPlaying(ytFrame, 25000);

    if (isPlaying) {
      console.log("✅✅✅ PLAYBACK CONFIRMED! Video is running.");
      console.log("Keeping video active for 30 minutes...");
      
      // Periodic check to ensure it's still playing
      const endTime = Date.now() + (30 * 60 * 1000);
      while (Date.now() < endTime) {
        await sleep(60000); // Check every minute
        try {
          const state = await evaluateWithTimeout(ytFrame, () => {
            const v = document.querySelector("video");
            return v ? { time: v.currentTime, paused: v.paused } : null;
          }, 2000);
          
          if (state) {
            console.log(`Still active: ${state.time.toFixed(0)}s, paused=${state.paused}`);
          }
        } catch (err) {
          console.log("Check failed, but continuing...");
        }
      }
      
      console.log("30 minutes completed. Exiting.");
    } else {
      console.log("⚠️ Could not confirm playback started");
      console.log("This may be due to YouTube's autoplay restrictions in headless mode");
      console.log("Keeping session active for 30 minutes anyway (view may still count)...");
      await sleep(30 * 60 * 1000);
    }

  } catch (err) {
    console.error("❌ FATAL ERROR:", err.message);
    console.error("Stack:", err.stack);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed. Script finished.");
    }
  }
})();
