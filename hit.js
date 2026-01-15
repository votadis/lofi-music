const puppeteer = require("puppeteer");
const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";

console.log("🎬 YOUTUBE API-FIRST Iframe View Bot");
console.log("Node:", process.version);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Extract video ID
function extractVideoId(url) {
  const match = url.match(/(?:embed\/|watch\?v=|v=)([^#\&\?]{11})/);
  return match ? match[1] : null;
}

// Wait for YouTube iframe
async function waitForYouTubeFrame(page, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const url = frame.url();
        if (url.includes('youtube.com/embed') && !url.includes('about:blank')) {
          // Test frame validity
          await frame.evaluate(() => true).catch(() => null);
          return frame;
        }
      } catch (e) { continue; }
    }
    await sleep(500);
  }
  return null;
}

// METHOD 1: Click on iframe to grant user interaction
async function grantUserInteraction(page, iframeHandle) {
  console.log("\n🔧 METHOD 1: Granting user interaction...");
  
  try {
    const box = await iframeHandle.boundingBox();
    if (!box) {
      console.log("❌ Could not get iframe position");
      return false;
    }
    
    // Click multiple times on iframe (grants autoplay permission)
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(centerX, centerY, { delay: 100 });
      await sleep(500);
    }
    
    console.log("✅ Granted user interaction to iframe");
    return true;
  } catch (err) {
    console.log("❌ Method 1 failed:", err.message);
    return false;
  }
}

// METHOD 2: Use YouTube's official Player API via page.evaluate
async function controlYouTubePlayer(page, videoId) {
  console.log("\n🔧 METHOD 2: Controlling via YouTube Player API...");
  
  try {
    const result = await page.evaluate(async (vid) => {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;
        
        function checkAndPlay() {
          attempts++;
          if (attempts > maxAttempts) {
            resolve({ success: false, reason: 'Max attempts reached' });
            return;
          }
          
          // Get the iframe
          const iframe = document.querySelector('iframe[src*="youtube.com"]');
          if (!iframe) {
            resolve({ success: false, reason: 'No iframe found' });
            return;
          }
          
          // Try to find YouTube player
          const win = iframe.contentWindow;
          if (!win) {
            setTimeout(checkAndPlay, 500);
            return;
          }
          
          // Check if YouTube player exists
          try {
            // Look for YouTube's player element
            const playerElement = iframe.contentDocument.querySelector('.html5-video-player');
            if (playerElement) {
              console.log('Found YouTube player element');
              
              // Simulate click on play button
              const playButton = iframe.contentDocument.querySelector('.ytp-play-button');
              if (playButton) {
                playButton.click();
                console.log('Clicked YouTube play button');
                resolve({ success: true, method: 'playButton' });
                return;
              }
              
              // Try spacebar on iframe
              const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
              iframe.contentDocument.dispatchEvent(event);
              console.log('Dispatched spacebar event');
              resolve({ success: true, method: 'keyboard' });
              return;
            }
          } catch (e) {
            console.log('Error accessing iframe content:', e.message);
          }
          
          setTimeout(checkAndPlay, 500);
        }
        
        checkAndPlay();
      });
    }, videoId);
    
    console.log("YouTube API control result:", result);
    await sleep(3000);
    return result.success;
  } catch (err) {
    console.log("❌ Method 2 failed:", err.message);
    return false;
  }
}

// METHOD 3: Inject and use YouTube IFrame Player API properly
async function injectYouTubePlayerAPI(page, videoId) {
  console.log("\n🔧 METHOD 3: Injecting YouTube Player API...");
  
  try {
    // First, ensure iframe has enablejsapi=1
    await page.evaluate((vid) => {
      const iframe = document.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        const url = new URL(iframe.src);
        url.searchParams.set('enablejsapi', '1');
        url.searchParams.set('autoplay', '1');
        url.searchParams.set('mute', '1');
        iframe.src = url.toString();
        console.log('Updated iframe with enablejsapi=1');
      }
    }, videoId);
    
    await sleep(3000);
    
    // Now inject API and control
    const result = await page.evaluate(async (vid) => {
      return new Promise((resolve) => {
        // Wait for YouTube API to be ready
        function initYTPlayer() {
          const iframe = document.querySelector('iframe[src*="youtube.com"]');
          if (!iframe) {
            resolve({ success: false, reason: 'no-iframe' });
            return;
          }
          
          try {
            // Create YouTube Player instance
            const player = new YT.Player(iframe, {
              events: {
                'onReady': (event) => {
                  console.log('YouTube Player READY!');
                  event.target.mute();
                  event.target.playVideo();
                  resolve({ success: true, playerReady: true });
                },
                'onStateChange': (event) => {
                  console.log('Player state changed:', event.data);
                  if (event.data === 1) {
                    console.log('🎬 VIDEO IS PLAYING!');
                  }
                },
                'onError': (error) => {
                  console.log('YouTube Player error:', error);
                  resolve({ success: false, reason: 'player-error', error });
                }
              }
            });
            
            console.log('YouTube Player instance created');
            
            // Fallback: force play after 3 seconds
            setTimeout(() => {
              try {
                player.mute();
                player.playVideo();
                console.log('Force play triggered');
              } catch (e) {
                console.log('Force play failed:', e.message);
              }
            }, 3000);
            
          } catch (e) {
            console.log('Failed to create YouTube Player:', e.message);
            resolve({ success: false, reason: e.message });
          }
        }
        
        // Load YouTube API if not already loaded
        if (typeof YT === 'undefined' || !YT.Player) {
          const tag = document.createElement('script');
          tag.src = "https://www.youtube.com/iframe_api";
          tag.onload = () => {
            console.log('YouTube API script loaded');
            // Wait for API to be ready
            window.onYouTubeIframeAPIReady = initYTPlayer;
          };
          document.head.appendChild(tag);
        } else {
          initYTPlayer();
        }
        
        // Timeout after 10 seconds
        setTimeout(() => {
          resolve({ success: false, reason: 'timeout' });
        }, 10000);
      });
    }, videoId);
    
    console.log("YouTube Player API result:", result);
    await sleep(5000);
    return result.success;
  } catch (err) {
    console.log("❌ Method 3 failed:", err.message);
    return false;
  }
}

// METHOD 4: Monitor and retry based on YouTube's actual state
async function monitorYouTubeState(page, videoId, minutes = 30) {
  console.log(`\n⏱️  MONITORING YOUTUBE PLAYER STATE FOR ${minutes} MINUTES\n`);
  
  const endTime = Date.now() + (minutes * 60 * 1000);
  let playingConfirmed = false;
  let lastPlayerState = null;
  
  while (Date.now() < endTime) {
    const elapsed = Math.floor((Date.now() - (endTime - minutes * 60 * 1000)) / 60000);
    
    try {
      const state = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[src*="youtube.com"]');
        if (!iframe) return { hasPlayer: false, reason: 'no-iframe' };
        
        try {
          // Check for YouTube's player element
          const playerElement = iframe.contentDocument.querySelector('.html5-video-player');
          const videoElement = iframe.contentDocument.querySelector('video');
          
          if (playerElement && videoElement) {
            // Get YouTube's internal player state
            const playerState = iframe.contentWindow.ytplayer && iframe.contentWindow.ytplayer.config;
            
            return {
              hasPlayer: true,
              videoTime: videoElement.currentTime,
              videoDuration: videoElement.duration,
              videoPaused: videoElement.paused,
              readyState: videoElement.readyState,
              playerState: playerState ? 'configured' : 'no-config',
              // Check for playing indicators
              isPlaying: videoElement.currentTime > 0 && !videoElement.paused,
              // Check YouTube's play button state
              playButtonState: iframe.contentDocument.querySelector('.ytp-play-button')?.getAttribute('aria-label')
            };
          }
          
          return { hasPlayer: false, reason: 'no-player-element' };
        } catch (e) {
          return { hasPlayer: false, reason: 'access-error', error: e.message };
        }
      });
      
      if (state.hasPlayer) {
        const isPlaying = state.isPlaying || state.playButtonState?.includes('Pause');
        
        if (isPlaying && !playingConfirmed) {
          console.log(`\n🎉 YOUTUBE PLAYER CONFIRMED PLAYING! 🎉`);
          console.log('State:', JSON.stringify(state, null, 2));
          playingConfirmed = true;
        }
        
        const timeStr = state.videoDuration ? 
          `${Math.floor(state.videoTime / 60)}:${Math.floor(state.videoTime % 60).toString().padStart(2, '0')}` :
          `${state.videoTime.toFixed(1)}s`;
        
        const status = isPlaying ? '✅ PLAYING' : '⏳ BUFFERING';
        console.log(`[${elapsed}/${minutes}min] ${timeStr} | ReadyState: ${state.readyState} | ${status}`);
        
        lastPlayerState = state;
        
        // Try to trigger play if stuck
        if (!isPlaying && state.readyState > 0) {
          console.log('Triggering play command...');
          await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="youtube.com"]');
            const video = iframe?.contentDocument?.querySelector('video');
            if (video) {
              video.play().catch(e => console.log('Play failed:', e.message));
            }
          });
        }
        
      } else {
        console.log(`[${elapsed}/${minutes}min] No player: ${state.reason}`);
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
    console.log("\n🚀 Launching browser with YouTube API-first approach...\n");
    
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

    // Get iframe and video ID
    const ytFrame = await waitForYouTubeFrame(page, 30000);
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      throw new Error("No YouTube iframe");
    }

    const videoId = extractVideoId(ytFrame.url());
    console.log("📹 YouTube iframe found");
    console.log("Video ID:", videoId);
    console.log("Iframe URL:", ytFrame.url());
    
    const iframeHandle = await ytFrame.frameElement();
    
    await sleep(2000);

    console.log("\n" + "=".repeat(60));
    console.log("STARTING YOUTUBE API-FIRST METHODS");
    console.log("=".repeat(60));
    
    // Method 1: Grant user interaction
    await grantUserInteraction(page, iframeHandle);
    
    // Method 2: Control via YouTube's player
    await controlYouTubePlayer(page, videoId);
    
    // Method 3: Inject and use YouTube API
    await injectYouTubePlayerAPI(page, videoId);
    
    console.log("\n" + "=".repeat(60));
    console.log("MONITORING YOUTUBE PLAYER STATE");
    console.log("=".repeat(60));
    
    // Monitor YouTube state
    const playingConfirmed = await monitorYouTubeState(page, videoId, 30);
    
    if (playingConfirmed) {
      console.log("\n✅✅✅ YOUTUBE PLAYER CONFIRMED PLAYING! ✅✅✅\n");
    } else {
      console.log("\n⚠️  Session completed\n");
    }
    
    process.exitCode = 0;

  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
})();
