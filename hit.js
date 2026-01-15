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
    await sleep(200);
    
    return { cx, cy };
  } catch (err) {
    console.log("Error clicking iframe center:", err.message);
    return null;
  }
}

async function evaluateWithTimeout(frame, fn, timeoutMs = 5000) {
  return Promise.race([
    frame.evaluate(fn),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Evaluation timeout')), timeoutMs)
    )
  ]);
}

async function forceVideoLoad(ytFrame) {
  console.log("Forcing video to load...");
  
  try {
    const result = await evaluateWithTimeout(ytFrame, () => {
      const v = document.querySelector("video");
      if (!v) return { success: false, reason: "no video" };
      
      // Force load
      v.load();
      v.muted = true;
      v.volume = 0;
      
      // Try to get it to start loading
      v.preload = "auto";
      
      return { 
        success: true, 
        src: v.src || v.currentSrc,
        readyState: v.readyState 
      };
    }, 3000);
    
    console.log("Force load result:", JSON.stringify(result));
    return result.success;
  } catch (err) {
    console.log("Force load error:", err.message);
    return false;
  }
}

async function tryStartPlayback(page, ytFrame) {
  console.log("Attempting playback strategies...");

  // First, try to force the video to load
  await forceVideoLoad(ytFrame);
  await sleep(2000);

  // Strategy 1: Click iframe FIRST (simulates user interaction)
  try {
    console.log("Trying iframe center click first...");
    const result = await clickIframeCenter(page, ytFrame);
    if (result) {
      console.log("✓ Clicked iframe center at", result);
      await sleep(1000);
    }
  } catch (err) {
    console.log("✗ Iframe center click error:", err.message);
  }

  // Strategy 2: JavaScript play after click
  try {
    console.log("Trying JS play after click...");
    const result = await evaluateWithTimeout(ytFrame, async () => {
      const v = document.querySelector("video");
      if (!v) return { success: false, reason: "no video element" };

      try {
        v.muted = true;
        v.volume = 0;
        
        // Try to play
        const playPromise = v.play();
        if (playPromise !== undefined) {
          // Actually await it this time since we clicked first
          await playPromise;
          return { success: true, method: "video.play() after click" };
        }
        
        return { success: !v.paused, method: "play triggered, no promise" };
      } catch (err) {
        return { success: false, reason: err.message };
      }
    }, 5000);

    console.log("JS play result:", JSON.stringify(result));
    
    if (result.success) {
      console.log("✓ JS play succeeded:", result.method);
      await sleep(2000);
      return result.method;
    }
  } catch (err) {
    console.log("✗ JS play error:", err.message);
  }

  // Strategy 3: Large play button
  try {
    console.log("Trying large play button...");
    const button = await ytFrame.waitForSelector("button.ytp-large-play-button", { timeout: 2000 });
    if (button) {
      await ytFrame.click("button.ytp-large-play-button", { delay: 100 });
      console.log("✓ Clicked large play button");
      await sleep(1500);
      return "clicked play button";
    }
  } catch (err) {
    console.log("✗ Large play button not found");
  }

  // Strategy 4: Another click + keyboard
  try {
    console.log("Trying keyboard after another click...");
    await clickIframeCenter(page, ytFrame);
    await sleep(200);
    await page.keyboard.press("k");
    await sleep(500);
    console.log("✓ Pressed 'k' key");
    return "keyboard after click";
  } catch (err) {
    console.log("✗ Keyboard error:", err.message);
  }

  return "all methods attempted";
}

async function waitUntilPlaying(ytFrame, timeoutMs = 30000) {
  console.log("Checking if video is playing (waiting for readyState >= 2)...");
  const start = Date.now();
  let checks = 0;
  let lastTime = -1;
  let sameTimeCount = 0;

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
          networkState: v.networkState,
          currentTime: v.currentTime,
          duration: v.duration,
          error: v.error ? v.error.message : null,
        };
      }, 2000);

      checks++;
      
      // Log more frequently and with more detail
      if (checks % 3 === 0 || state.currentTime > 0 || state.readyState >= 2) {
        console.log(`Check #${checks}: time=${state.currentTime?.toFixed(2)}s, ` +
                   `paused=${state.paused}, ready=${state.readyState}, ` +
                   `network=${state.networkState}, error=${state.error}`);
      }

      // Success: currentTime is advancing
      if (state.hasVideo && state.currentTime > 0 && state.currentTime !== lastTime) {
        console.log(`✅ Video is ACTUALLY playing! Time: ${state.currentTime.toFixed(2)}s`);
        return true;
      }

      // Alternate success: readyState indicates loaded and playing
      if (state.hasVideo && !state.paused && state.readyState >= 2 && state.currentTime > 0) {
        console.log(`✅ Video playing (readyState ${state.readyState})`);
        return true;
      }

      // Check for errors
      if (state.error) {
        console.log(`❌ Video error detected: ${state.error}`);
        return false;
      }

      lastTime = state.currentTime;
      await sleep(1000);
    } catch (err) {
      console.log("Error checking playback:", err.message);
      await sleep(1000);
    }
  }

  // Final check - maybe it started late
  try {
    const finalState = await evaluateWithTimeout(ytFrame, () => {
      const v = document.querySelector("video");
      return v ? { time: v.currentTime, ready: v.readyState, paused: v.paused } : null;
    }, 2000);
    
    if (finalState && finalState.time > 0) {
      console.log(`✅ Video started late! Time: ${finalState.time.toFixed(2)}s`);
      return true;
    }
  } catch (_) {}

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
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-default-browser-check",
        "--disable-hang-monitor",
      ],
      dumpio: false,
    });

    console.log("Browser launched successfully");

    const page = await browser.newPage();
    console.log("New page created");
    
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Remove webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // Mock more properties
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    console.log("Navigating to:", NOTION_URL);
    await page.goto(NOTION_URL, { 
      waitUntil: "networkidle0", // Wait for all network activity
      timeout: 90000 
    });
    
    console.log("Page loaded successfully");

    console.log("Waiting for YouTube iframe...");
    const ytFrame = await waitForYouTubeFrame(page, 90000);
    
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      return;
    }

    console.log("✅ YouTube frame found:", ytFrame.url());
    
    // Wait longer for YouTube player to initialize
    console.log("Waiting for YouTube player to initialize...");
    await sleep(5000);

    const method = await tryStartPlayback(page, ytFrame);
    console.log("Playback attempt completed. Method:", method);

    const isPlaying = await waitUntilPlaying(ytFrame, 35000);

    if (isPlaying) {
      console.log("✅✅✅ PLAYBACK CONFIRMED! Video is actually running.");
      console.log("Keeping video active for 30 minutes...");
      
      // Monitor every minute
      const endTime = Date.now() + (30 * 60 * 1000);
      let checkCount = 0;
      
      while (Date.now() < endTime) {
        await sleep(60000);
        checkCount++;
        
        try {
          const state = await evaluateWithTimeout(ytFrame, () => {
            const v = document.querySelector("video");
            return v ? { 
              time: v.currentTime, 
              paused: v.paused,
              ended: v.ended,
              readyState: v.readyState 
            } : null;
          }, 2000);
          
          if (state) {
            const minutes = Math.floor(state.time / 60);
            const seconds = Math.floor(state.time % 60);
            console.log(`[${checkCount} min] Video at ${minutes}:${seconds.toString().padStart(2, '0')}, ` +
                       `paused=${state.paused}, ready=${state.readyState}`);
            
            if (state.ended) {
              console.log("Video ended. Continuing session...");
            }
          }
        } catch (err) {
          console.log(`[${checkCount} min] Check failed, continuing...`);
        }
      }
      
      console.log("✅ 30 minutes completed successfully!");
    } else {
      console.log("⚠️ Could not confirm playback with advancing currentTime");
      console.log("Video may be blocked by network/autoplay policy");
      console.log("Keeping session active for 30 minutes (view might still register)...");
      await sleep(30 * 60 * 1000);
      console.log("30 minutes session completed");
    }

  } catch (err) {
    console.error("❌ FATAL ERROR:", err.message);
    console.error("Stack:", err.stack);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("✅ Browser closed. Script finished.");
    }
  }
})();
