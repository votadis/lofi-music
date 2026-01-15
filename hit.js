const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Win64; x64) AppleWebKit/537.36');
  await page.goto('https://youtube.com/live/bNuU1DXalDk?feature=share', {waitUntil: 'networkidle2'});
  // stable click
  await page.waitForSelector('video', {visible: true, timeout: 15000});
  const video = await page.$('video');
  await page.evaluate(el => el.scrollIntoView(), video);
  await page.waitForTimeout(1000);
  await video.click({force: true});
  // 60 min wait inside page
  await page.evaluate(() => {
    return new Promise(resolve => setTimeout(resolve, 60*60*1000));
  });
  await browser.close();
})();
