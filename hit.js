const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Win64; x64) AppleWebKit/537.36');
  await page.goto('https://www.notion.so/my-youtube-channel-2e9738b77dc280d7aacee21336d29898?t=new&showMoveTo=true&saveParent=true');   // <-- CHANGE HERE
  await page.waitForSelector('iframe');
  const frame = page.frames()[1];
  await frame.waitForSelector('video');
  await frame.click('video');
  await page.waitForTimeout(30*60*1000);
  await browser.close();
})();
