/**

淘宝店铺首页长截图服务
部署到 Railway 后，手机端通过快捷指令访问
GET /screenshot?shopId=12345678
返回完整长截图 PNG
 */

const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  navigationTimeout: 45000,
  scrollStep: 400,
  scrollInterval: 300,
  waitAfterScroll: 1500,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
async function captureTaobaoShop(shopId) {
  const url = https://shop.m.taobao.com/shop/shop_index.htm?shop_id=${shopId};
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  });
  try {
    const context = await browser.newContext({
      viewport: CONFIG.viewport,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      userAgent: CONFIG.userAgent,
    });
const page = await context.newPage();

// 反检测
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
});

console.log(`🌐 访问: ${url}`);
await page.goto(url, { waitUntil: 'networkidle', timeout: CONFIG.navigationTimeout });

const currentUrl = page.url();
if (currentUrl.includes('login') || currentUrl.includes('captcha')) {
  throw new Error('检测到验证码拦截，当前为未登录状态');
}

// 模拟滚动触发懒加载
console.log('⬇ 滚动加载中...');
await page.evaluate(async (step, interval) => {
  await new Promise((resolve) => {
    let total = 0;
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      total += step;
      if (total >= document.body.scrollHeight) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}, CONFIG.scrollStep, CONFIG.scrollInterval);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(CONFIG.waitAfterScroll);

// 隐藏粘性元素
await page.evaluate(() => {
  document.querySelectorAll('[class*="header"], [class*="sticky"], [class*="fixed"]').forEach(el => {
    if (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).position === 'sticky') {
      el.style.display = 'none';
    }
  });
});

// 等待图片加载
await page.evaluate(() => Promise.all(
  Array.from(document.images).filter(i => !i.complete)
    .map(i => new Promise(r => { i.onload = i.onerror = r; }))
));

const height = await page.evaluate(() => document.body.scrollHeight);
console.log(`📐 页面高度: ${Math.round(height)}px`);

const buffer = await page.screenshot({ fullPage: true, type: 'png' });
console.log(`✅ 截图完成: ${Math.round(buffer.length / 1024)}KB`);
return buffer;

  } finally {
    await browser.close();
  }
}
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => {
  res.send(<h1>📸 淘宝店铺截图服务</h1>     <p>✅ 服务运行中</p>     <p>用法: <code>/screenshot?shopId=店铺ID</code></p>     <p><a href="/screenshot?shopId=12345678">测试截图</a></p>     <p><a href="/health">健康检查</a></p>);
});
app.get('/screenshot', async (req, res) => {
  const shopId = req.query.shopId;
  if (!shopId) return res.status(400).json({ error: '请提供 shopId' });
  if (!/^\d+$/.test(shopId)) return res.status(400).json({ error: 'shopId 必须为数字' });
  try {
    const buffer = await captureTaobaoShop(shopId);
    res.set({ 'Content-Type': 'image/png', 'Content-Disposition': attachment; filename="shop_${shopId}.png" });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(PORT, () => console.log(服务启动: 端口 ${PORT}));
