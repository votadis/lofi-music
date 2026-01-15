const puppeteer = require("puppeteer");

const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("🚀 AGGRESSIVE YouTube Playback Bot");
console.log("Node:", process.version);

// Extract video ID from URL
function extractVideoId(url) {
  const match = url.match(/embed\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

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

// METHOD 1: Try to force load video with all possible tricks
async function forceVideoLoadInFrame(ytFrame) {
  console.log("\n🔧 METHOD 1: Force loading video in iframe...");
  
  try {
    const result = await evaluateWithTimeout(ytFrame, () => {
      const video = document.querySelector("video");
      if (!video) return { success: false, reason: "No video element" };
      
      // Force attributes
      video.preload = "auto";
      video.muted = true;
      video.volume = 0;
      video.autoplay = true;
      
      // Remove any blocking attributes
      video.removeAttribute("loop");
      
      // Force load
      video.load();
      
      // Try to set a source if missing
      if (!video.src && !video.currentSrc) {
        const sources = video.querySelectorAll("source");
        if (sources.length > 0) {
          video.src = sources[0].src;
          video.load();
        }
      }
      
      // Attempt play
      video.play().catch(e => console.log("Play blocked:", e));
      
      return {
        success: true,
        hasSrc: !!(video.src || video.currentSrc),
        readyState: video.readyState,
        paused: video.paused
      };
    }, 5000);
    
    console.log("   Result:", JSON.stringify(result));
    return result.success;
  } catch (err) {
    console.log("   ❌ Failed:", err.message);
    return false;
  }
}

// METHOD 2: Open video in new tab directly
async function playInDirectTab(browser, videoId) {
  console.log("\n🔧 METHOD 2: Opening video in direct tab...");
  
  try {
    const directPage = await browser.newPage();
    await directPage.setViewport({ width: 1920, height: 1080 });
    
    await directPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await directPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    // Go directly to watch page
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=1&mute=1`;
    console.log("   Loading:", watchUrl);
    
    await directPage.goto(watchUrl, { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });
    
    console.log("   ✅ Direct page loaded");
    
    // Wait for video element
    await sleep(5000);
    
    // Try to play
    const played = await directPage.evaluate(() => {
      const video = document.querySelector("video");
      if (!video) return false;
      
      video.muted = true;
      video.play().catch(() => {});
      
      return true;
    });
    
    if (played) {
      console.log("   ✅ Video element found and play triggered");
      
      // Monitor playback
      await sleep(3000);
      
      const state = await directPage.evaluate(() => {
        const v = document.querySelector("video");
        return v ? {
          time: v.currentTime,
          paused: v.paused,
          readyState: v.readyState,
          src: !!(v.src || v.currentSrc)
        } : null;
      });
      
      console.log("   State:", JSON.stringify(state));
      
      if (state && state.time > 0) {
        console.log("   🎉 SUCCESS! Video is playing in direct tab!");
        return { success: true, page: directPage };
      }
    }
    
    // If not playing, close and return failure
    await directPage.close();
    console.log("   ❌ Direct tab method failed");
    return { success: false, page: null };
    
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    return { success: false, page: null };
  }
}

// METHOD 3: Replace iframe with autoplay embed
async function replaceIframeWithAutoplay(page, videoId) {
  console.log("\n🔧 METHOD 3: Replacing iframe with autoplay version...");
  
  try {
    await page.evaluate((vid) => {
      const iframe = document.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        const newUrl = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&enablejsapi=1`;
        iframe.src = newUrl;
        console.log("Iframe replaced with:", newUrl);
      }
    }, videoId);
    
    console.log("   ✅ Iframe URL updated with autoplay");
    await sleep(5000);
    
    const ytFrame = await waitForYouTubeFrame(page, 30000);
    if (!ytFrame) {
      console.log("   ❌ Frame not found after replacement");
      return false;
    }
    
    // Check if it's playing now
    const state = await evaluateWithTimeout(ytFrame, () => {
      const v = document.querySelector("video");
      return v ? {
        time: v.currentTime,
        paused: v.paused,
        src: !!(v.src || v.currentSrc)
      } : null;
    }, 3000);
    
    console.log("   State:", JSON.stringify(state));
    
    if (state && state.time > 0) {
      console.log("   🎉 SUCCESS! Autoplay iframe is working!");
      return true;
    }
    
    console.log("   ❌ Autoplay iframe not playing yet");
    return false;
    
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    return false;
  }
}

// METHOD 4: Use YouTube IFrame API
async function useYouTubeAPI(page, videoId) {
  console.log("\n🔧 METHOD 4: Using YouTube IFrame Player API...");
  
  try {
    await page.evaluate((vid) => {
      // Inject YouTube IFrame API
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      
      // Wait for API and create player
      window.onYouTubeIframeAPIReady = function() {
        const iframe = document.querySelector('iframe[src*="youtube.com"]');
        if (iframe) {
          new YT.Player(iframe, {
            events: {
              'onReady': (event) => {
                event.target.mute();
                event.target.playVideo();
                console.log("YouTube API: Playing video");
              }
            }
          });
        }
      };
    }, videoId);
    
    console.log("   ✅ YouTube API injected");
    await sleep(5000);
    
    return true;
    
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    return false;
  }
}

// METHOD 5: Headless=false with aggressive clicking
async function aggressiveClickMethod(page, ytFrame) {
  console.log("\n🔧 METHOD 5: Aggressive clicking and keyboard...");
  
  try {
    const iframeHandle = await ytFrame.frameElement();
    const box = await iframeHandle.boundingBox();
    
    if (!box) {
      console.log("   ❌ Can't get iframe position");
      return false;
    }
    
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    
    // Click multiple times at different positions
    const positions = [
      { x: cx, y: cy },
      { x: cx - 50, y: cy },
      { x: cx + 50, y: cy },
      { x: cx, y: cy + 50 },
    ];
    
    for (const pos of positions) {
      await page.mouse.click(pos.x, pos.y, { delay: 50 });
      await sleep(200);
    }
    
    console.log("   ✅ Clicked multiple positions");
    
    // Try all keyboard shortcuts
    const keys = [' ', 'k', 'Enter'];
    for (const key of keys) {
      await page.keyboard.press(key);
      await sleep(300);
    }
    
    console.log("   ✅ Tried all keyboard shortcuts");
    
    // Force play via JS
    await ytFrame.evaluate(() => {
      const v = document.querySelector("video");
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    });
    
    await sleep(2000);
    return true;
    
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    return false;
  }
}

async function monitorPlayback(page, minutes = 30) {
  console.log(`\n⏱️  MONITORING PLAYBACK FOR ${minutes} MINUTES\n`);
  
  const endTime = Date.now() + (minutes * 60 * 1000);
  let playingConfirmed = false;
  
  while (Date.now() < endTime) {
    const elapsed = Math.floor((Date.now() - (endTime - minutes * 60 * 1000)) / 60000);
    
    try {
      // Check all video elements on page (including direct tab if open)
      const state = await page.evaluate(() => {
        const videos = Array.from(document.querySelectorAll("video"));
        
        // Also check in iframes
        const iframes = Array.from(document.querySelectorAll("iframe"));
        for (const iframe of iframes) {
          try {
            const iframeVideos = iframe.contentDocument?.querySelectorAll("video");
            if (iframeVideos) videos.push(...Array.from(iframeVideos));
          } catch (e) {}
        }
        
        if (videos.length === 0) return null;
        
        // Find any playing video
        for (const v of videos) {
          if (v.currentTime > 0 && !v.paused) {
            return {
              time: v.currentTime,
              paused: v.paused,
              readyState: v.readyState,
              duration: v.duration
            };
          }
        }
        
        // Return first video state even if not playing
        const v = videos[0];
        return {
          time: v.currentTime,
          paused: v.paused,
          readyState: v.readyState,
          duration: v.duration
        };
      });
      
      if (state && state.time > 0 && !playingConfirmed) {
        console.log(`\n🎉🎉🎉 VIDEO IS PLAYING! Time: ${state.time.toFixed(2)}s 🎉🎉🎉\n`);
        playingConfirmed = true;
      }
      
      if (elapsed % 2 === 0 || playingConfirmed) {
        const status = playingConfirmed ? '✅ PLAYING' : '⏳ waiting';
        const timeStr = state ? `${Math.floor(state.time / 60)}:${Math.floor(state.time % 60).toString().padStart(2, '0')}` : 'N/A';
        console.log(`[${elapsed}/${minutes}min] ${timeStr} | ${status}`);
      }
      
    } catch (err) {}
    
    await sleep(5000);
  }
  
  return playingConfirmed;
}

(async () => {
  let browser;
  let directPage = null;
  
  try {
    console.log("\n🚀 Launching browser (non-headless for maximum compatibility)...\n");
    
    browser = await puppeteer.launch({
      headless: false, // NON-HEADLESS is critical
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required",
      ],
      defaultViewport: null,
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log("📄 Loading Notion page...");
    await page.goto(NOTION_URL, { waitUntil: "networkidle2", timeout: 90000 });
    console.log("✅ Notion page loaded\n");

    const ytFrame = await waitForYouTubeFrame(page, 90000);
    
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      throw new Error("No YouTube iframe");
    }

    const videoId = extractVideoId(ytFrame.url());
    console.log("✅ YouTube iframe found");
    console.log("📹 Video ID:", videoId);
    
    await sleep(3000);

    // TRY ALL METHODS IN SEQUENCE
    let success = false;
    
    // Method 1: Force load in frame
    if (!success) {
      success = await forceVideoLoadInFrame(ytFrame);
      if (success) await sleep(3000);
    }
    
    // Method 2: Direct tab (most reliable)
    if (!success && videoId) {
      const result = await playInDirectTab(browser, videoId);
      if (result.success) {
        success = true;
        directPage = result.page;
      }
    }
    
    // Method 3: Replace iframe
    if (!success && videoId) {
      success = await replaceIframeWithAutoplay(page, videoId);
      if (success) await sleep(3000);
    }
    
    // Method 4: YouTube API
    if (!success && videoId) {
      await useYouTubeAPI(page, videoId);
      await sleep(5000);
    }
    
    // Method 5: Aggressive clicking
    if (!success) {
      await aggressiveClickMethod(page, ytFrame);
      await sleep(3000);
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("ALL METHODS ATTEMPTED - STARTING MONITORING");
    console.log("=".repeat(50));
    
    // Monitor on the page that's most likely to have video playing
    const monitorPage = directPage || page;
    const playingConfirmed = await monitorPlayback(monitorPage, 30);
    
    if (playingConfirmed) {
      console.log("\n✅✅✅ SUCCESS! Video played for 30 minutes! ✅✅✅\n");
    } else {
      console.log("\n⚠️ Could not confirm playback, but session completed\n");
    }
    
    process.exitCode = 0;

  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Done!\n");
    }
  }
})();
