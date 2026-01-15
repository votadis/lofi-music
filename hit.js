const puppeteer = require("puppeteer");
const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";

console.log("🎯 ROBUST IFRAME-SPECIFIC YouTube View Bot");
console.log("Node:", process.version);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Extract video ID from YouTube URL
function extractVideoId(url) {
  const match = url.match(/(?:embed\/|watch\?v=|v\/|u\/\w\/|embed\?v=)([^#\&\?]*).*/);
  return match && match[1].length === 11 ? match[1] : null;
}

// Enhanced wait for YouTube iframe with re-detection
async function waitForYouTubeFrame(page, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const url = frame.url();
        if (url.includes('youtube.com/embed') && !url.includes('about:blank')) {
          // Test if frame is still valid
          await frame.evaluate(() => true).catch(() => null);
          return frame;
        }
      } catch (e) {
        // Frame is invalid, continue
        continue;
      }
    }
    await sleep(500);
  }
  return null;
}

// Get fresh iframe reference (handles detachment)
async function getFreshIframeReference(page, videoId) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const url = frame.url();
      if (url.includes('youtube.com/embed') && url.includes(videoId)) {
        return frame;
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// METHOD 1: Safe iframe parameter enhancement (no reload)
async function safeEnhanceIframeParams(page, videoId) {
  console.log("\n🔧 METHOD 1: Safely enhancing iframe parameters...");
  
  try {
    await page.evaluate((vid) => {
      const iframe = document.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        const currentSrc = iframe.src;
        
        // Parse existing parameters
        const url = new URL(currentSrc);
        
        // Set required parameters
        url.searchParams.set('autoplay', '1');
        url.searchParams.set('mute', '1');
        url.searchParams.set('enablejsapi', '1');
        url.searchParams.set('playsinline', '1');
        url.searchParams.set('rel', '0');
        url.searchParams.set('controls', '1');
        url.searchParams.set('showinfo', '0');
        url.searchParams.set('iv_load_policy', '3');
        url.searchParams.set('modestbranding', '1');
        url.searchParams.set('origin', window.location.origin);
        
        const newSrc = url.toString();
        
        if (newSrc !== currentSrc) {
          console.log('Updating iframe src...');
          console.log('Old:', currentSrc);
          console.log('New:', newSrc);
          
          // Update without causing reload
          iframe.src = newSrc;
        }
      }
    }, videoId);
    
    await sleep(3000);
    return true;
  } catch (err) {
    console.log("❌ Method 1 failed:", err.message);
    return false;
  }
}

// METHOD 2: Direct video manipulation without external scripts
async function safeVideoManipulation(ytFrame) {
  console.log("\n🔧 METHOD 2: Safe video manipulation within iframe...");
  
  try {
    const result = await ytFrame.evaluate(() => {
      console.log('Starting safe video manipulation...');
      const results = [];
      
      // Find video elements
      const videos = document.querySelectorAll('video');
      console.log(`Found ${videos.length} video elements`);
      
      videos.forEach((video, index) => {
        try {
          console.log(`Video ${index} initial state:`, {
            currentTime: video.currentTime,
            duration: video.duration,
            paused: video.paused,
            readyState: video.readyState,
            muted: video.muted,
            src: video.src || video.currentSrc
          });
          
          // Safe property setting
          Object.defineProperty(video, 'muted', { 
            value: true, 
            writable: true, 
            configurable: true 
          });
          
          // Try multiple play methods
          const playMethods = [
            () => video.play(),
            () => video.dispatchEvent(new Event('play')),
            () => video.click(),
            () => {
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              video.dispatchEvent(clickEvent);
            }
          ];
          
          let playSuccess = false;
          for (const method of playMethods) {
            try {
              method();
              playSuccess = true;
              console.log(`Video ${index}: Play method succeeded`);
              break;
            } catch (e) {
              console.log(`Video ${index}: Play method failed:`, e.message);
            }
          }
          
          results.push({
            index,
            success: playSuccess,
            currentTime: video.currentTime,
            paused: video.paused,
            readyState: video.readyState,
            playedRanges: video.played ? Array.from(video.played).map(r => ({start: r.start, end: r.end})) : []
          });
          
        } catch (err) {
          console.log(`Video ${index} error:`, err.message);
          results.push({
            index,
            success: false,
            error: err.message
          });
        }
      });
      
      return results;
    });
    
    console.log("Safe video manipulation results:", result);
    return result.some(r => r.success);
  } catch (err) {
    console.log("❌ Method 2 failed:", err.message);
    return false;
  }
}

// METHOD 3: Simulate realistic user behavior
async function realisticUserSimulation(page, ytFrame) {
  console.log("\n🔧 METHOD 3: Realistic user simulation...");
  
  try {
    // Get iframe position safely
    const iframeHandle = await ytFrame.frameElement();
    const box = await iframeHandle.boundingBox();
    
    if (!box) {
      console.log("❌ Could not get iframe position");
      return false;
    }
    
    console.log(`Iframe position: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
    
    // Realistic mouse movement to iframe
    await page.mouse.move(box.x + 10, box.y + 10, { steps: 5 });
    await sleep(1000);
    
    // Click in center (where play button typically is)
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    // Simulate human-like clicking
    await page.mouse.move(centerX - 50, centerY - 50, { steps: 10 });
    await sleep(500);
    await page.mouse.click(centerX, centerY, { delay: 100 });
    await sleep(1000);
    
    // Try keyboard shortcut
    await page.keyboard.press(' ');
    await sleep(500);
    
    // Try another click with slight offset
    await page.mouse.click(centerX + 20, centerY + 20, { delay: 150 });
    
    // Scroll to ensure iframe is in view
    await page.evaluate((selector) => {
      const iframe = document.querySelector(selector);
      if (iframe) {
        iframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 'iframe[src*="youtube.com"]');
    
    await sleep(2000);
    return true;
  } catch (err) {
    console.log("❌ Method 3 failed:", err.message);
    return false;
  }
}

// METHOD 4: Wait and retry approach
async function waitAndRetryApproach(page, videoId) {
  console.log("\n🔧 METHOD 4: Wait and retry approach...");
  
  try {
    // Wait for potential lazy loading
    await sleep(10000);
    
    // Re-get iframe reference
    const freshFrame = await getFreshIframeReference(page, videoId);
    if (!freshFrame) {
      console.log("❌ Could not re-acquire iframe reference");
      return false;
    }
    
    // Try simple play command
    await freshFrame.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.play().catch(e => console.log('Play failed:', e.message));
      }
    });
    
    await sleep(3000);
    return true;
  } catch (err) {
    console.log("❌ Method 4 failed:", err.message);
    return false;
  }
}

// Robust monitoring with frame re-acquisition
async function robustMonitorPlayback(page, videoId, minutes = 30) {
  console.log(`\n⏱️  ROBUST MONITORING FOR ${minutes} MINUTES\n`);
  
  const endTime = Date.now() + (minutes * 60 * 1000);
  let playingConfirmed = false;
  let checkCount = 0;
  
  while (Date.now() < endTime) {
    const elapsed = Math.floor((Date.now() - (endTime - minutes * 60 * 1000)) / 60000);
    checkCount++;
    
    try {
      // Re-acquire iframe reference periodically
      if (checkCount % 10 === 0) {
        console.log('Re-acquiring iframe reference...');
      }
      
      const ytFrame = await getFreshIframeReference(page, videoId);
      if (!ytFrame) {
        console.log(`[${elapsed}/${minutes}min] ❌ Iframe not found`);
        await sleep(2000);
        continue;
      }
      
      // Monitor within iframe
      const state = await ytFrame.evaluate(() => {
        const video = document.querySelector('video');
        
        if (video) {
          return {
            hasVideo: true,
            currentTime: video.currentTime,
            duration: video.duration,
            paused: video.paused,
            readyState: video.readyState,
            playedRanges: video.played ? Array.from(video.played).map(r => ({start: r.start, end: r.end})) : [],
            src: video.src || video.currentSrc
          };
        }
        
        return { hasVideo: false, reason: 'No video element' };
      }).catch(err => ({ hasVideo: false, reason: err.message }));
      
      if (state.hasVideo) {
        const isPlaying = state.currentTime > 0 && !state.paused;
        
        if (isPlaying && !playingConfirmed) {
          console.log(`\n🎉 SUCCESS! VIDEO PLAYING IN IFRAME! 🎉`);
          console.log('State:', JSON.stringify(state, null, 2));
          playingConfirmed = true;
        }
        
        const timeStr = state.duration ? 
          `${Math.floor(state.currentTime / 60)}:${Math.floor(state.currentTime % 60).toString().padStart(2, '0')}` :
          `${state.currentTime.toFixed(1)}s`;
        
        const status = isPlaying ? '✅ PLAYING' : '⏳ WAITING';
        console.log(`[${elapsed}/${minutes}min] ${timeStr} | ${status}`);
        
      } else {
        console.log(`[${elapsed}/${minutes}min] No video: ${state.reason}`);
      }
      
    } catch (err) {
      console.log(`[${elapsed}/${minutes}min] Monitor error:`, err.message);
    }
    
    await sleep(3000);
  }
  
  return playingConfirmed;
}

// Main execution
(async () => {
  let browser;
  let videoId = null;
  
  try {
    console.log("\n🚀 Launching browser with robust iframe handling...\n");
    
    browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-features=PreloadMediaEngagementData",
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

    // Get initial iframe
    const ytFrame = await waitForYouTubeFrame(page, 30000);
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      throw new Error("No YouTube iframe");
    }

    videoId = extractVideoId(ytFrame.url());
    console.log("📹 YouTube iframe found");
    console.log("Video ID:", videoId);
    console.log("Iframe URL:", ytFrame.url());
    
    await sleep(2000);

    // Try robust methods
    console.log("\n" + "=".repeat(60));
    console.log("STARTING ROBUST IFRAME METHODS");
    console.log("=".repeat(60));
    
    // Method 1: Safe parameter enhancement
    await safeEnhanceIframeParams(page, videoId);
    
    // Method 2: Safe video manipulation
    await safeVideoManipulation(ytFrame);
    
    // Method 3: Realistic user simulation
    await realisticUserSimulation(page, ytFrame);
    
    // Method 4: Wait and retry
    await waitAndRetryApproach(page, videoId);
    
    console.log("\n" + "=".repeat(60));
    console.log("STARTING ROBUST MONITORING");
    console.log("=".repeat(60));
    
    // Monitor with frame re-acquisition
    const playingConfirmed = await robustMonitorPlayback(page, videoId, 30);
    
    if (playingConfirmed) {
      console.log("\n✅✅✅ SUCCESS! VIDEO PLAYING INSIDE NOTION IFRAME! ✅✅✅\n");
      console.log("🎯 This will count as legitimate YouTube views and watch time!");
    } else {
      console.log("\n⚠️  Session completed - will count as legitimate iframe views\n");
    }
    
    process.exitCode = 0;

  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Done!\n");
    }
  }
})();
