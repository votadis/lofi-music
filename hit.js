const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800'
    ],
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  );

  await page.goto(
    'https://aromatic-ruby-0bf.notion.site/my-youtube-channel-2e9738b77dc280d7aacee21336d29898',
    { waitUntil: 'networkidle2', timeout: 60000 }
  );

  // Wait for any iframe
  await page.waitForSelector('iframe', { timeout: 60000 });

  // Find YouTube iframe
  const ytFrame = page
    .frames()
    .find(f => f.url().includes('youtube.com') || f.url().includes('youtu.be'));

  if (!ytFrame) {
    console.log('YouTube iframe not found');
    await browser.close();
    return;
  }

  // Click center of iframe to start playback
  const box = await ytFrame.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { x: r.width / 2, y: r.height / 2 };
  });

  await ytFrame.mouse.click(box.x, box.y);
  console.log('Playback triggered');

  // Stay open for 30 minutes
  await page.waitForTimeout(30 * 60 * 1000);

  await browser.close();
})();
