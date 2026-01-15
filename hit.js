const puppeteer = require("puppeteer");
const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";

console.log("🎯 IFRAME-SPECIFIC YouTube View Bot");
console.log("Node:", process.version);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Extract video ID from YouTube URL
function extractVideoId(url) {
  const match = url.match(/(?:embed\/|watch\?v=|v\/|u\/\w\/|embed\?v=)([^#\&\?]*).*/);
  return match && match[1].length === 11 ? match[1] : null;
}

// Wait for YouTube iframe specifically
async function waitForYouTubeFrame(page, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frames = page.frames();
    for (const frame of frames) {
      const url = frame.url();
      if (url.includes('youtube.com/embed') && !url.includes('about:blank')) {
        return frame;
      }
    }
    await sleep(500);
  }
  return null;
}

// METHOD 1: Manipulate iframe src to add autoplay parameters
async function enhanceIframeParams(page, videoId) {
  console.log("\n🔧 METHOD 1: Enhancing iframe parameters...");
  
  try {
    await page.evaluate((vid) => {
      const iframe = document.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        const currentSrc = iframe.src;
        let newSrc = currentSrc;
        
        // Add/ensure autoplay parameters
        if (!newSrc.includes('autoplay')) {
          newSrc += (newSrc.includes('?') ? '&' : '?') + 'autoplay=1';
        }
        if (!newSrc.includes('mute')) {
          newSrc += '&mute=1';
        }
        if (!newSrc.includes('enablejsapi')) {
          newSrc += '&enablejsapi=1';
        }
        if (!newSrc.includes('playsinline')) {
          newSrc += '&playsinline=1';
        }
        if (!newSrc.includes('rel')) {
          newSrc += '&rel=0';
        }
        if (!newSrc.includes('controls')) {
          newSrc += '&controls=1';
        }
        
        // Only update if we made changes
        if (newSrc !== currentSrc) {
          console.log('Updating iframe src from:', currentSrc);
          console.log('To:', newSrc);
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

// METHOD 2: Inject YouTube API directly into the iframe
async function injectYouTubeAPIIntoIframe(ytFrame, videoId) {
  console.log("\n🔧 METHOD 2: Injecting YouTube API into iframe...");
  
  try {
    await ytFrame.evaluate((vid) => {
      // Check if YouTube API is already loaded
      if (typeof YT !== 'undefined' && YT.Player) {
        console.log('YouTube API already available');
        return true;
      }
      
      // Load YouTube API
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      
      // Wait for API to be ready
      window.onYouTubeIframeAPIReady = function() {
        console.log('YouTube API ready');
        
        // Try to access existing player or create new one
        const video = document.querySelector('video');
        if (video) {
          console.log('Found video element, attempting to play...');
          video.muted = true;
          video.play().catch(e => console.log('Video play failed:', e));
        }
      };
    }, videoId);
    
    await sleep(5000);
    return true;
  } catch (err) {
    console.log("❌ Method 2 failed:", err.message);
    return false;
  }
}

// METHOD 3: Direct video element manipulation within iframe
async function manipulateVideoInIframe(ytFrame) {
  console.log("\n🔧 METHOD 3: Manipulating video element in iframe...");
  
  try {
    const result = await ytFrame.evaluate(() => {
      const results = [];
      
      // Find all video elements
      const videos = document.querySelectorAll('video');
      console.log(`Found ${videos.length} video elements`);
      
      videos.forEach((video, index) => {
        try {
          console.log(`Processing video ${index}:`, {
            src: video.src || video.currentSrc,
            paused: video.paused,
            readyState: video.readyState,
            duration: video.duration,
            currentTime: video.currentTime
          });
          
          // Force video settings
          video.muted = true;
          video.preload = 'auto';
          video.autoplay = true;
          
          // Remove restrictions
          video.removeAttribute('loop');
          video.setAttribute('playsinline', '');
          
          // Try to play
          const playPromise = video.play();
          if (playPromise) {
            playPromise.then(() => {
              console.log(`Video ${index} play succeeded`);
            }).catch(e => {
              console.log(`Video ${index} play failed:`, e.message);
            });
          }
          
          results.push({
            index,
            success: true,
            paused: video.paused,
            currentTime: video.currentTime,
            readyState: video.readyState
          });
          
        } catch (err) {
          results.push({
            index,
            success: false,
            error: err.message
          });
        }
      });
      
      return results;
    });
    
    console.log("Video manipulation results:", result);
    return result.some(r => r.success);
  } catch (err) {
    console.log("❌ Method 3 failed:", err.message);
    return false;
  }
}

// METHOD 4: Simulate user interactions within iframe
async function simulateUserInteractions(page, ytFrame) {
  console.log("\n🔧 METHOD 4: Simulating user interactions in iframe...");
  
  try {
    // Get iframe position
    const iframeHandle = await ytFrame.frameElement();
    const box = await iframeHandle.boundingBox();
    
    if (!box) {
      console.log("❌ Could not get iframe position");
      return false;
    }
    
    console.log(`Iframe position: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
    
    // Click in the center of the iframe (where play button would be)
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    // Multiple click attempts
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(centerX, centerY, { delay: 100 });
      await sleep(1000);
    }
    
    // Try keyboard shortcuts
    await page.focus(ytFrame);
    await page.keyboard.press(' ');
    await sleep(500);
    await page.keyboard.press('k');
    await sleep(500);
    
    // Send click events directly to iframe
    await ytFrame.evaluate(() => {
      // Click on various elements that might be play buttons
      const possibleButtons = document.querySelectorAll(
        'button, .ytp-play-button, .ytp-large-play-button, [aria-label*="play"], [title*="play"]'
      );
      
      possibleButtons.forEach((btn, index) => {
        setTimeout(() => {
          btn.click();
          console.log(`Clicked button ${index}`);
        }, index * 500);
      });
      
      // Also try clicking on video element itself
      const videos = document.querySelectorAll('video');
      videos.forEach((video, index) => {
        setTimeout(() => {
          video.click();
          console.log(`Clicked video ${index}`);
        }, (possibleButtons.length + index) * 500);
      });
    });
    
    await sleep(3000);
    return true;
  } catch (err) {
    console.log("❌ Method 4 failed:", err.message);
    return false;
  }
}

// METHOD 5: Force reload iframe with optimal parameters
async function forceReloadIframe(page, videoId) {
  console.log("\n🔧 METHOD 5: Force reloading iframe with optimal parameters...");
  
  try {
    await page.evaluate((vid) => {
      const iframe = document.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        // Store current iframe
        const parent = iframe.parentNode;
        const nextSibling = iframe.nextSibling;
        
        // Create new iframe with optimal parameters
        const newIframe = document.createElement('iframe');
        newIframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&enablejsapi=1&playsinline=1&rel=0&controls=1&showinfo=0&iv_load_policy=3&modestbranding=1`;
        newIframe.width = iframe.width || '100%';
        newIframe.height = iframe.height || '100%';
        newIframe.frameBorder = '0';
        newIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        newIframe.setAttribute('allowfullscreen', '');
        
        // Replace old iframe
        parent.insertBefore(newIframe, nextSibling);
        
        // Remove old iframe after a delay
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1000);
        
        console.log('Iframe replaced with optimized version');
      }
    }, videoId);
    
    await sleep(5000);
    return true;
  } catch (err) {
    console.log("❌ Method 5 failed:", err.message);
    return false;
  }
}

// Advanced monitoring specifically for iframe playback
async function monitorIframePlayback(page, ytFrame, minutes = 30) {
  console.log(`\n⏱️  MONITORING IFRAME PLAYBACK FOR ${minutes} MINUTES\n`);
  
  const endTime = Date.now() + (minutes * 60 * 1000);
  let playingConfirmed = false;
  let lastState = null;
  
  while (Date.now() < endTime) {
    const elapsed = Math.floor((Date.now() - (endTime - minutes * 60 * 1000)) / 60000);
    
    try {
      // Monitor specifically within the iframe
      const state = await ytFrame.evaluate(() => {
        const video = document.querySelector('video');
        
        if (video) {
          return {
            hasVideo: true,
            currentTime: video.currentTime,
            duration: video.duration,
            paused: video.paused,
            readyState: video.readyState,
            muted: video.muted,
            src: video.src || video.currentSrc,
            played: video.played ? Array.from(video.played).map(r => ({start: r.start, end: r.end})) : []
          };
        }
        
        // Also check for YouTube API state
        if (window.YT && window.YT.Player) {
          // Look for any YouTube player instances
          const playerElements = document.querySelectorAll('#player, .youtube-player');
          for (const el of playerElements) {
            if (el.getPlayerState && el.getPlayerState() === 1) {
              return {
                hasVideo: true,
                youtubeApiPlaying: true,
                currentTime: el.getCurrentTime ? el.getCurrentTime() : 0,
                duration: el.getDuration ? el.getDuration() : 0
              };
            }
          }
        }
        
        return { hasVideo: false };
      });
      
      if (state.hasVideo) {
        const isPlaying = (state.currentTime > 0 && !state.paused) || state.youtubeApiPlaying;
        
        if (isPlaying && !playingConfirmed) {
          console.log(`\n🎉 SUCCESS! VIDEO PLAYING IN IFRAME! 🎉`);
          console.log('State:', JSON.stringify(state, null, 2));
          playingConfirmed = true;
        }
        
        const timeStr = state.duration ? 
          `${Math.floor(state.currentTime / 60)}:${Math.floor(state.currentTime % 60).toString().padStart(2, '0')}/${Math.floor(state.duration / 60)}:${Math.floor(state.duration % 60).toString().padStart(2, '0')}` :
          `${state.currentTime.toFixed(1)}s`;
        
        const status = isPlaying ? '✅ PLAYING' : '⏳ BUFFERING';
        console.log(`[${elapsed}/${minutes}min] ${timeStr} | ${status}`);
        
        lastState = state;
      } else {
        console.log(`[${elapsed}/${minutes}min] No video detected in iframe`);
      }
      
    } catch (err) {
      console.log(`[${elapsed}/${minutes}min] Monitor error:`, err.message);
    }
    
    await sleep(5000);
  }
  
  return playingConfirmed;
}

// Main execution
(async () => {
  let browser;
  
  try {
    console.log("\n🚀 Launching browser for iframe-specific playback...\n");
    
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

    // Wait for YouTube iframe
    const ytFrame = await waitForYouTubeFrame(page, 30000);
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      throw new Error("No YouTube iframe");
    }

    const videoId = extractVideoId(ytFrame.url());
    console.log("📹 YouTube iframe found");
    console.log("Video ID:", videoId);
    console.log("Iframe URL:", ytFrame.url());
    
    await sleep(2000);

    // Try all iframe-specific methods
    console.log("\n" + "=".repeat(60));
    console.log("STARTING IFRAME-SPECIFIC METHODS");
    console.log("=".repeat(60));
    
    let success = false;
    
    // Method 1: Enhance iframe parameters
    await enhanceIframeParams(page, videoId);
    
    // Method 2: Inject YouTube API into iframe
    await injectYouTubeAPIIntoIframe(ytFrame, videoId);
    
    // Method 3: Manipulate video element within iframe
    const videoManipulated = await manipulateVideoInIframe(ytFrame);
    if (videoManipulated) success = true;
    
    // Method 4: Simulate user interactions
    await simulateUserInteractions(page, ytFrame);
    
    // Method 5: Force reload iframe
    await forceReloadIframe(page, videoId);
    
    // Wait a bit for everything to settle
    await sleep(5000);
    
    console.log("\n" + "=".repeat(60));
    console.log("STARTING IFRAME MONITORING");
    console.log("=".repeat(60));
    
    // Monitor specifically within the iframe
    const playingConfirmed = await monitorIframePlayback(page, ytFrame, 30);
    
    if (playingConfirmed) {
      console.log("\n✅✅✅ SUCCESS! VIDEO PLAYING INSIDE NOTION IFRAME! ✅✅✅\n");
      console.log("🎯 This will count as legitimate YouTube views and watch time!");
    } else {
      console.log("\n⚠️  Could not confirm iframe playback, but session completed\n");
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
