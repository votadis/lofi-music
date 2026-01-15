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

async function evaluateWithTimeout(frame, fn, timeoutMs = 5000) {
  return Promise.race([
    frame.evaluate(fn),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Evaluation timeout')), timeoutMs)
    )
  ]);
}

async function waitForYouTubePlayerReady(ytFrame, timeoutMs = 30000) {
  console.log("Waiting for YouTube player to be ready...");
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await evaluateWithTimeout(ytFrame, () => {
        // Check if YouTube player API is loaded
        const video = document.querySelector("video");
        if (!video) return { ready: false, reason: "no video element" };
        
        // Check if video has a valid source
        const hasSrc = !!(video.src || video.currentSrc);
        
        // Check if player controls exist (indicates player loaded)
        const hasControls = !!document.querySelector(".ytp-chrome-bottom");
        
        return {
          ready: hasSrc && hasControls,
          hasSrc,
          hasControls,
          src: video.src || video.currentSrc,
          readyState: video.readyState,
        };
      }, 3000);
      
      if (ready.ready) {
        console.log("✅ YouTube player is ready!");
        console.log("Video src:", ready.src);
        return true;
      }
      
      if (!ready.hasSrc) {
        console.log("Waiting for video source to load...");
      } else if (!ready.hasControls) {
        console.log("Waiting for player controls to load...");
      }
      
      await sleep(1000);
    } catch (err) {
      console.log("Player check error:", err.message);
      await sleep(1000);
    }
  }
  
  console.log("⚠️ Player ready timeout - continuing anyway");
  return false;
}

async function clickIframeCenter(page, frame) {
  try {
    const iframeHandle = await frame.frameElement();
    if (!iframeHandle) return null;

    await iframeHandle.evaluate((el) =>
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
    );

    const box = await iframeHandle.boundingBox();
    if (!box) return null;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Triple click to ensure interaction is registered
    await page.mouse.click(cx, cy, { delay: 100 });
    await sleep(100);
    await page.mouse.click(cx, cy, { delay: 100 });
    await sleep(100);
    await page.mouse.click(cx, cy, { delay: 100 });
    
    return { cx, cy };
  } catch (err) {
    console.log("Error clicking iframe:", err.message);
    return null;
  }
}

async function tryStartPlayback(page, ytFrame) {
  console.log("Starting playback attempts...");

  // Wait for player to be actually ready
  await waitForYouTubePlayerReady(ytFrame, 30000);
  await sleep(2000);

  // Strategy 1: Click first (user gesture)
  console.log("1. Clicking iframe center...");
  await clickIframeCenter(page, ytFrame);
  await sleep(1500);

  // Strategy 2: Try JS play
  console.log("2. Trying video.play() via JS...");
  try {
    const result = await evaluateWithTimeout(ytFrame, async () => {
      const v = document.querySelector("video");
      if (!v) return { success: false };
      
      v.muted = true;
      try {
        await v.play();
        return { success: true, paused: v.paused, time: v.currentTime };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, 5000);
    
    console.log("   Result:", JSON.stringify(result));
    if (result.success) {
      await sleep(2000);
      return "JS play succeeded";
    }
  } catch (err) {
    console.log("   JS play error:", err.message);
  }

  // Strategy 3: Click play button if visible
  console.log("3. Looking for play button...");
  try {
    const hasButton = await ytFrame.evaluate(() => {
      const btn = document.querySelector("button.ytp-large-play-button");
      return !!btn;
    });
    
    if (hasButton) {
      await ytFrame.click("button.ytp-large-play-button");
      console.log("   Clicked play button");
      await sleep(2000);
      return "Clicked play button";
    } else {
      console.log("   No play button found");
    }
  } catch (err) {
    console.log("   Play button error:", err.message);
  }

  // Strategy 4: Spacebar
  console.log("4. Trying spacebar...");
  await page.keyboard.press(" ");
  await sleep(1000);

  return "All strategies attempted";
}

async function monitorPlayback(ytFrame, durationMinutes = 30) {
  console.log(`\n=== MONITORING PLAYBACK FOR ${durationMinutes} MINUTES ===\n`);
  
  const endTime = Date.now() + (durationMinutes * 60 * 1000);
  let checkNum = 0;
  let lastTime = 0;
  let playingConfirmed = false;
  
  while (Date.now() < endTime) {
    checkNum++;
    
    try {
      const state = await evaluateWithTimeout(ytFrame, () => {
        const v = document.querySelector("video");
        if (!v) return null;
        return {
          time: v.currentTime,
          duration: v.duration,
          paused: v.paused,
          ended: v.ended,
          readyState: v.readyState,
          networkState: v.networkState,
          buffered: v.buffered.length > 0 ? v.buffered.end(0) : 0,
        };
      }, 3000);
      
      if (state) {
        const timeChanged = state.time !== lastTime && state.time > 0;
        
        if (timeChanged && !playingConfirmed) {
          console.log("🎉 VIDEO IS PLAYING! Time advancing from", lastTime.toFixed(2), "to", state.time.toFixed(2));
          playingConfirmed = true;
        }
        
        // Log every 2 minutes
        if (checkNum % 24 === 0 || timeChanged) {
          const elapsed = Math.floor((Date.now() - (endTime - durationMinutes * 60 * 1000)) / 60000);
          const mins = Math.floor(state.time / 60);
          const secs = Math.floor(state.time % 60);
          
          console.log(
            `[+${elapsed}min] Video: ${mins}:${secs.toString().padStart(2, '0')} | ` +
            `Ready: ${state.readyState} | Network: ${state.networkState} | ` +
            `Paused: ${state.paused} | ${playingConfirmed ? '✅ PLAYING' : '⏳ waiting'}`
          );
        }
        
        lastTime = state.time;
      } else {
        console.log(`[Check ${checkNum}] No video element found`);
      }
      
      await sleep(5000); // Check every 5 seconds
      
    } catch (err) {
      if (checkNum % 12 === 0) {
        console.log(`[Check ${checkNum}] Monitoring error (continuing...)`);
      }
      await sleep(5000);
    }
  }
  
  console.log(`\n=== ${durationMinutes} MINUTES COMPLETED ===`);
  console.log(`Final status: ${playingConfirmed ? '✅ Playback was confirmed' : '⚠️ Playback not confirmed'}`);
  
  return playingConfirmed;
}

(async () => {
  let browser;
  
  try {
    console.log("Launching browser (headless mode with virtual display)...");
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--start-maximized",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        // Add virtual display support
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
      dumpio: false,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    console.log("Navigating to Notion page...");
    await page.goto(NOTION_URL, { 
      waitUntil: "networkidle0",
      timeout: 90000 
    });
    
    console.log("✅ Page loaded");

    const ytFrame = await waitForYouTubeFrame(page, 90000);
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      process.exitCode = 1;
      return;
    }

    console.log("✅ YouTube iframe found:", ytFrame.url());
    console.log("Waiting for iframe to stabilize...");
    await sleep(3000);

    const method = await tryStartPlayback(page, ytFrame);
    console.log("\nPlayback initiation completed:", method);
    console.log("Now monitoring for actual playback...\n");
    
    await sleep(3000);

    // Monitor for 30 minutes
    const success = await monitorPlayback(ytFrame, 30);
    
    if (success) {
      console.log("\n✅✅✅ SUCCESS! Video playback was confirmed and monitored for 30 minutes.");
      process.exitCode = 0;
    } else {
      console.log("\n⚠️ Session completed but playback was not confirmed.");
      console.log("The view may still have been counted by YouTube's analytics.");
      process.exitCode = 0; // Still exit successfully
    }

  } catch (err) {
    console.error("\n❌ FATAL ERROR:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("\nClosing browser...");
      await browser.close();
      console.log("✅ Done!");
    }
  }
})();
