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
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

async function clickIframeCenter(page, frame) {
  try {
    const iframeHandle = await frame.frameElement();
    if (!iframeHandle) return null;

    const box = await iframeHandle.boundingBox();
    if (!box) return null;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Multiple clicks
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(cx, cy, { delay: 50 });
      await sleep(200);
    }
    
    return { cx, cy };
  } catch (err) {
    return null;
  }
}

async function tryStartPlayback(page, ytFrame) {
  console.log("Attempting to start playback...");

  // Wait for any element in the frame to ensure it's loaded
  await sleep(5000);

  // Click the iframe multiple times
  console.log("Clicking iframe...");
  await clickIframeCenter(page, ytFrame);
  await sleep(2000);

  // Try pressing space
  console.log("Pressing space...");
  await page.keyboard.press(" ");
  await sleep(1000);

  // Try pressing 'k' (YouTube play/pause)
  console.log("Pressing 'k'...");
  await page.keyboard.press("k");
  await sleep(1000);

  // Try JS play
  console.log("Trying JS play...");
  try {
    await evaluateWithTimeout(ytFrame, () => {
      const v = document.querySelector("video");
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    }, 3000);
  } catch (err) {
    console.log("JS play failed:", err.message);
  }

  await sleep(2000);
}

async function monitorPlayback(ytFrame, durationMinutes = 30) {
  console.log(`\n=== MONITORING FOR ${durationMinutes} MINUTES ===\n`);
  
  const endTime = Date.now() + (durationMinutes * 60 * 1000);
  let checkNum = 0;
  let lastTime = -1;
  let playingConfirmed = false;
  let consecutiveErrors = 0;
  
  while (Date.now() < endTime) {
    checkNum++;
    const elapsed = Math.floor((Date.now() - (endTime - durationMinutes * 60 * 1000)) / 60000);
    
    try {
      const state = await evaluateWithTimeout(ytFrame, () => {
        const v = document.querySelector("video");
        if (!v) return null;
        return {
          time: v.currentTime,
          paused: v.paused,
          ready: v.readyState,
          network: v.networkState,
          src: v.src || v.currentSrc,
        };
      }, 3000);
      
      if (state) {
        consecutiveErrors = 0;
        
        const timeAdvanced = state.time > lastTime && state.time > 0;
        
        if (timeAdvanced && !playingConfirmed) {
          console.log(`\n🎉 VIDEO IS PLAYING! Time: ${state.time.toFixed(2)}s\n`);
          playingConfirmed = true;
        }
        
        // Log every minute or when state changes
        if (checkNum % 12 === 0 || timeAdvanced || checkNum === 1) {
          const mins = Math.floor(state.time / 60);
          const secs = Math.floor(state.time % 60);
          const status = playingConfirmed ? '✅ PLAYING' : (state.src ? '⏳ loaded' : '❌ no src');
          
          console.log(
            `[+${elapsed}m] ${mins}:${secs.toString().padStart(2, '0')} | ` +
            `ready:${state.ready} net:${state.network} paused:${state.paused} | ${status}`
          );
        }
        
        lastTime = state.time;
      } else {
        consecutiveErrors++;
        if (consecutiveErrors === 1) {
          console.log(`[+${elapsed}m] No video element`);
        }
      }
      
      await sleep(5000);
      
    } catch (err) {
      consecutiveErrors++;
      if (consecutiveErrors === 1) {
        console.log(`[+${elapsed}m] Check failed: ${err.message}`);
      }
      await sleep(5000);
    }
  }
  
  console.log(`\n=== COMPLETED ===`);
  return playingConfirmed;
}

(async () => {
  let browser;
  
  try {
    console.log("Launching browser...");
    
    // Try headless: false first for GitHub Actions with Xvfb
    const launchOptions = {
      headless: false, // Non-headless works with Xvfb
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required",
      ],
    };

    browser = await puppeteer.launch(launchOptions);
    console.log("✅ Browser launched");

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log("Loading page...");
    await page.goto(NOTION_URL, { 
      waitUntil: "networkidle2",
      timeout: 90000 
    });
    console.log("✅ Page loaded");

    const ytFrame = await waitForYouTubeFrame(page, 90000);
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      process.exitCode = 1;
      return;
    }

    console.log("✅ YouTube iframe found");
    await tryStartPlayback(page, ytFrame);

    const success = await monitorPlayback(ytFrame, 30);
    
    console.log(success ? "\n✅ SUCCESS!" : "\n⚠️ Playback not confirmed (view may still count)");
    process.exitCode = 0;

  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
})();
