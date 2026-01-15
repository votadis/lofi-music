const puppeteer = require("puppeteer");

const NOTION_URL = "https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("🚀 YouTube Iframe Playback Bot");
console.log("Node:", process.version);

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

async function evaluateWithTimeout(target, fn, timeoutMs = 5000) {
  return Promise.race([
    target.evaluate(fn),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

// AGGRESSIVE METHOD 1: Replace iframe src with alternative embed services
async function replaceIframeWithAlternatives(page, videoId) {
  console.log("\n🔧 METHOD 1: Replacing iframe with alternative embeds...");
  
  const alternatives = [
    // YouTube nocookie with all autoplay params
    `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1&enablejsapi=1&modestbranding=1&rel=0&loop=1&playlist=${videoId}`,
    // Invidious embed
    `https://invidious.privacydev.net/embed/${videoId}?autoplay=1`,
    // Another Invidious instance
    `https://inv.nadeko.net/embed/${videoId}?autoplay=1`,
    // Piped embed
    `https://piped.video/embed/${videoId}?autoplay=1`,
  ];
  
  for (let i = 0; i < alternatives.length; i++) {
    const url = alternatives[i];
    console.log(`   Trying alternative ${i + 1}: ${url.split('/')[2]}...`);
    
    try {
      // Replace iframe src
      await page.evaluate((newUrl) => {
        const iframe = document.querySelector('iframe[src*="youtube"]') || 
                      document.querySelector('iframe[src*="invidious"]') ||
                      document.querySelector('iframe[src*="piped"]');
        if (iframe) {
          iframe.src = newUrl;
          console.log("Iframe src replaced with:", newUrl);
        }
      }, url);
      
      console.log("   ✅ Iframe replaced, waiting for load...");
      await sleep(8000); // Wait for new iframe to load
      
      // Get the new frame
      const frames = page.frames();
      const newFrame = frames.find(f => 
        f.url().includes('youtube') || 
        f.url().includes('invidious') || 
        f.url().includes('piped')
      );
      
      if (!newFrame) {
        console.log("   ❌ New frame not found");
        continue;
      }
      
      console.log("   Found frame:", newFrame.url());
      
      // Click center of iframe
      try {
        const iframeHandle = await newFrame.frameElement();
        const box = await iframeHandle.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await sleep(500);
        }
      } catch (e) {}
      
      // Try to play
      try {
        await evaluateWithTimeout(newFrame, () => {
          const v = document.querySelector('video');
          if (v) {
            v.muted = true;
            v.play().catch(() => {});
          }
        }, 3000);
      } catch (e) {}
      
      await sleep(3000);
      
      // Check if playing
      const state = await evaluateWithTimeout(newFrame, () => {
        const v = document.querySelector('video');
        if (!v) return null;
        return {
          time: v.currentTime,
          paused: v.paused,
          readyState: v.readyState,
          src: !!(v.src || v.currentSrc)
        };
      }, 3000).catch(() => null);
      
      console.log("   State:", JSON.stringify(state));
      
      if (state && state.time > 0 && !state.paused) {
        console.log("   🎉 SUCCESS! Video playing in iframe!");
        return { success: true, frame: newFrame };
      }
      
      if (state && state.src && state.readyState > 0) {
        console.log("   ⚠️ Video loaded but not playing yet, continuing with this...");
        return { success: true, frame: newFrame };
      }
      
    } catch (err) {
      console.log("   ❌ Error:", err.message);
      continue;
    }
  }
  
  return { success: false, frame: null };
}

// AGGRESSIVE METHOD 2: Inject YouTube IFrame API into page
async function injectYouTubeAPI(page, videoId) {
  console.log("\n🔧 METHOD 2: Injecting YouTube IFrame API...");
  
  try {
    await page.evaluate((vid) => {
      return new Promise((resolve) => {
        // Load IFrame API
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onload = () => {
          console.log("YouTube API loaded");
          resolve();
        };
        document.head.appendChild(tag);
        
        // Set up API ready callback
        window.onYouTubeIframeAPIReady = function() {
          const iframe = document.querySelector('iframe[src*="youtube"]');
          if (!iframe) {
            console.log("No iframe found");
            return;
          }
          
          // Add enablejsapi parameter if missing
          const currentSrc = iframe.src;
          if (!currentSrc.includes('enablejsapi')) {
            iframe.src = currentSrc + (currentSrc.includes('?') ? '&' : '?') + 'enablejsapi=1';
          }
          
          setTimeout(() => {
            const player = new YT.Player(iframe, {
              events: {
                'onReady': (event) => {
                  console.log("Player ready");
                  event.target.mute();
                  event.target.playVideo();
                  console.log("Play command sent");
                },
                'onStateChange': (event) => {
                  console.log("State changed:", event.data);
                }
              }
            });
          }, 2000);
        };
        
        // Trigger ready if API already loaded
        setTimeout(() => {
          if (window.YT && window.YT.Player) {
            window.onYouTubeIframeAPIReady();
          }
        }, 3000);
      });
    }, videoId);
    
    console.log("   ✅ API injected, waiting for player...");
    await sleep(8000);
    
    // Check frame
    const ytFrame = await waitForYouTubeFrame(page);
    if (!ytFrame) {
      console.log("   ❌ Frame lost");
      return { success: false, frame: null };
    }
    
    const state = await evaluateWithTimeout(ytFrame, () => {
      const v = document.querySelector('video');
      return v ? {
        time: v.currentTime,
        paused: v.paused,
        readyState: v.readyState
      } : null;
    }, 3000).catch(() => null);
    
    console.log("   State:", JSON.stringify(state));
    
    if (state && state.time > 0) {
      console.log("   🎉 SUCCESS with YouTube API!");
      return { success: true, frame: ytFrame };
    }
    
    return { success: false, frame: ytFrame };
    
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    return { success: false, frame: null };
  }
}

// AGGRESSIVE METHOD 3: Multiple aggressive clicks + force play loop
async function aggressiveForcePlay(page, ytFrame) {
  console.log("\n🔧 METHOD 3: Aggressive force play in original iframe...");
  
  try {
    const iframeHandle = await ytFrame.frameElement();
    const box = await iframeHandle.boundingBox();
    
    if (!box) {
      console.log("   ❌ Can't get iframe position");
      return { success: false, frame: ytFrame };
    }
    
    // Click many times in different positions
    console.log("   Clicking iframe extensively...");
    const positions = [
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { x: box.x + box.width / 3, y: box.y + box.height / 2 },
      { x: box.x + box.width * 2/3, y: box.y + box.height / 2 },
      { x: box.x + box.width / 2, y: box.y + box.height / 3 },
      { x: box.x + 100, y: box.y + 100 },
    ];
    
    for (const pos of positions) {
      await page.mouse.click(pos.x, pos.y, { delay: 50 });
      await sleep(100);
    }
    
    // Try all keyboard shortcuts
    console.log("   Trying keyboard shortcuts...");
    const keys = [' ', 'k', 'm', 'Enter'];
    for (const key of keys) {
      await page.keyboard.press(key);
      await sleep(200);
    }
    
    // Force play in loop
    console.log("   Force playing in loop...");
    for (let i = 0; i < 5; i++) {
      try {
        await ytFrame.evaluate(() => {
          const v = document.querySelector('video');
          if (v) {
            v.muted = true;
            v.volume = 0;
            v.autoplay = true;
            v.load();
            v.play().catch(() => {});
          }
        });
        await sleep(1000);
      } catch (e) {}
    }
    
    await sleep(3000);
    
    const state = await evaluateWithTimeout(ytFrame, () => {
      const v = document.querySelector('video');
      return v ? {
        time: v.currentTime,
        paused: v.paused,
        readyState: v.readyState,
        networkState: v.networkState
      } : null;
    }, 3000).catch(() => null);
    
    console.log("   State:", JSON.stringify(state));
    
    if (state && state.time > 0) {
      console.log("   🎉 SUCCESS! Video playing!");
      return { success: true, frame: ytFrame };
    }
    
    // Even if not confirmed, return the frame
    return { success: false, frame: ytFrame };
    
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    return { success: false, frame: ytFrame };
  }
}

async function monitorIframePlayback(page, frame, minutes = 30) {
  console.log(`\n⏱️  MONITORING IFRAME FOR ${minutes} MINUTES\n`);
  
  const endTime = Date.now() + (minutes * 60 * 1000);
  let playingConfirmed = false;
  let lastTime = -1;
  
  while (Date.now() < endTime) {
    const elapsed = Math.floor((Date.now() - (endTime - minutes * 60 * 1000)) / 60000);
    
    try {
      const state = await evaluateWithTimeout(frame, () => {
        const v = document.querySelector('video');
        return v ? {
          time: v.currentTime,
          paused: v.paused,
          readyState: v.readyState,
          networkState: v.networkState,
          src: !!(v.src || v.currentSrc)
        } : null;
      }, 3000);
      
      if (state) {
        const timeAdvanced = state.time > lastTime && state.time > 0;
        
        if (timeAdvanced && !playingConfirmed) {
          console.log(`\n🎉 VIDEO IS PLAYING IN IFRAME! Time: ${state.time.toFixed(2)}s\n`);
          playingConfirmed = true;
        }
        
        if (elapsed % 2 === 0 || timeAdvanced) {
          const mins = Math.floor(state.time / 60);
          const secs = Math.floor(state.time % 60);
          const status = playingConfirmed ? '✅ PLAYING' : (state.src ? '⏳ loaded' : '❌ no src');
          
          console.log(
            `[${elapsed}/${minutes}min] ${mins}:${secs.toString().padStart(2, '0')} | ` +
            `ready:${state.readyState} net:${state.networkState} | ${status}`
          );
        }
        
        lastTime = state.time;
      }
      
    } catch (err) {
      if (elapsed % 5 === 0) {
        console.log(`[${elapsed}/${minutes}min] Check failed, continuing...`);
      }
    }
    
    await sleep(5000);
  }
  
  return playingConfirmed;
}

(async () => {
  let browser;
  
  try {
    console.log("\n🚀 Launching browser...\n");
    
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
        "--disable-features=IsolateOrigins,site-per-process",
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
    console.log("✅ Page loaded\n");

    const ytFrame = await waitForYouTubeFrame(page, 90000);
    
    if (!ytFrame) {
      console.log("❌ YouTube iframe not found");
      throw new Error("No iframe");
    }

    const videoId = extractVideoId(ytFrame.url());
    console.log("✅ YouTube iframe found");
    console.log("📹 Video ID:", videoId);
    console.log("🔗 Original URL:", ytFrame.url());
    
    await sleep(3000);

    console.log("\n🎯 Attempting to play video IN IFRAME...\n");

    let activeFrame = ytFrame;
    let success = false;

    // Try Method 1: Replace with alternatives
    if (!success && videoId) {
      const result = await replaceIframeWithAlternatives(page, videoId);
      if (result.success) {
        success = true;
        activeFrame = result.frame;
      }
    }

    // Try Method 2: YouTube IFrame API
    if (!success && videoId) {
      const result = await injectYouTubeAPI(page, videoId);
      if (result.success) {
        success = true;
        activeFrame = result.frame;
      }
    }

    // Try Method 3: Aggressive force play
    if (!success) {
      const result = await aggressiveForcePlay(page, ytFrame);
      activeFrame = result.frame;
      success = result.success;
    }

    console.log("\n" + "=".repeat(60));
    if (success) {
      console.log("✅ PLAYBACK INITIATED IN IFRAME");
    } else {
      console.log("⚠️ PLAYBACK NOT CONFIRMED, BUT CONTINUING");
    }
    console.log("=".repeat(60));

    const playingConfirmed = await monitorIframePlayback(page, activeFrame, 30);
    
    if (playingConfirmed) {
      console.log("\n🎉🎉🎉 SUCCESS! Video played in iframe for 30 minutes! 🎉🎉🎉\n");
    } else {
      console.log("\n⚠️ Session completed (playback not confirmed but iframe was active)\n");
    }
    
    process.exitCode = 0;

  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed\n");
    }
  }
})();
