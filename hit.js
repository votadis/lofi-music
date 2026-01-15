const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Win64; x64) AppleWebKit/537.36');
  // DIRECT watch page (not embed)
  await page.goto('https://www.youtube.com/live/bNuU1DXalDk', {waitUntil: 'networkidle2'});
  await page.waitForSelector('video');
  await page.click('video'); // click play
  await page.waitForTimeout(60*60*1000); // 60 min watch
  await browser.close();
})();
