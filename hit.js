const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Win64; x64) AppleWebKit/537.36');
  await page.goto('https://www.youtube.com/watch?v=YOUR_STREAM_ID', {waitUntil: 'networkidle2'});
  await page.waitForSelector('video');
  await page.click('video');
  // 60 min wait inside page
  await page.evaluate(() => {
    return new Promise(resolve => setTimeout(resolve, 60*60*1000));
  });
  await browser.close();
})();
