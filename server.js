
/**
 * 淘宝/天猫店铺首页长截图服务
 * 自动识别淘宝店和天猫店，完美处理懒加载
 * 
 * GET /screenshot?shopId=72571314  → 返回 PNG 长截图
 */

const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  navigationTimeout: 30000,
  scrollStep: 400,
  scrollInterval: 300,
  waitAfterScroll: 1500,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

/**
 * 自动检测店铺类型并截图
 * 依次尝试：淘宝H5 → 天猫H5 → 淘宝PC
 */
async function captureShop(shopId) {
  // 按优先级排列的待尝试 URL 列表
  const urls = [
    { url: `https://shop.m.taobao.com/shop/shop_index.htm?shop_id=${shopId}`, type: '淘宝H5' },
    { url: `https://shop.m.tmall.com/shop/shop_index.htm?shop_id=${shopId}`, type: '天猫H5' },
    { url: `https://shop${shopId}.taobao.com`, type: '淘宝PC' },
    { url: `https://shop${shopId}.tmall.com`, type: '天猫PC' },
  ];

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

    // 反检测注入
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    });

    // 依次尝试每个 URL
    let loaded = false;
    for (const item of urls) {
      try {
        console.log(`🔄 尝试: ${item.type} → ${item.url}`);
        await page.goto(item.url, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        const currentUrl = page.url();
        if (currentUrl.includes('login') || currentUrl.includes('captcha')) {
          console.log(`⚠ ${item.type} 被拦截（验证码/登录页），跳过`);
          continue;
        }

        // 检查页面是否真的有内容
        const bodyText = await page.evaluate(() => document.body.innerText.length);
        if (bodyText < 50) {
          console.log(`⚠ ${item.type} 页面内容过少，跳过`);
          continue;
        }

        loaded = true;
        console.log(`✅ 成功访问: ${item.type}`);
        break;
      } catch (err) {
        console.log(`❌ ${item.type} 访问失败: ${err.message}`);
      }
    }

    if (!loaded) {
      throw new Error('所有地址均无法访问，店铺ID可能不存在或被反爬拦截');
    }

    // ===== 模拟滚动触发懒加载 =====
    console.log('⬇ 开始滚动加载...');
    await page.evaluate(async (step, interval) => {
      await new Promise((resolve) => {
        let total = 0;
        const maxScroll = document.body.scrollHeight * 3;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          if (total >= document.body.scrollHeight || total > maxScroll) {
            clearInterval(timer);
            resolve();
          }
        }, interval);
      });
    }, CONFIG.scrollStep, CONFIG.scrollInterval);

    // 回滚到顶部
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(CONFIG.waitAfterScroll);

    // ===== 隐藏粘性元素 =====
    await page.evaluate(() => {
      document.querySelectorAll('[class*="header"], [class*="sticky"], [class*="fixed"], [class*="nav"]').forEach(el => {
        if (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).position === 'sticky') {
          el.style.display = 'none';
        }
      });
    });

    // ===== 等待图片加载 =====
    await page.evaluate(() => Promise.all(
      Array.from(document.images)
        .filter(i => !i.complete)
        .map(i => new Promise(r => { i.onload = i.onerror = r; }))
    ));

    // ===== 截图 =====
    const height = await page.evaluate(() => document.body.scrollHeight);
    console.log(`📐 页面高度: ${Math.round(height)}px`);

    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    console.log(`✅ 截图完成: ${Math.round(buffer.length / 1024)}KB`);

    return buffer;
  } finally {
    await browser.close();
  }
}

// ============ API 路由 ============

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>淘宝/天猫店铺截图服务</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
        .card { border: 1px solid #ddd; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .btn { display: inline-block; background: #2649B2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; }
        input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; width: 200px; }
      </style>
    </head>
    <body>
      <h1>📸 淘宝/天猫店铺截图服务</h1>
      <p>✅ 自动识别淘宝店和天猫店</p>
      
      <div class="card">
        <h2>🔍 快速测试</h2>
        <p>输入店铺ID：</p>
        <input id="shopId" type="text" placeholder="如 72571314" value="72571314">
        <button class="btn" onclick="window.open('/screenshot?shopId='+document.getElementById('shopId').value)">截图</button>
      </div>

      <div class="card">
        <h2>📱 iPhone 快捷指令</h2>
        <p>API 地址：</p>
        <code>GET /screenshot?shopId=店铺ID</code>
        <p style="margin-top: 12px; color: #666;">
          💡 在快捷指令中设置此 URL，返回的 PNG 自动保存到相册
        </p>
      </div>

      <div class="card">
        <h2>📊 状态</h2>
        <p><a href="/health">/health</a> - 健康检查</p>
      </div>
    </body>
    </html>
  `);
});

app.get('/screenshot', async (req, res) => {
  const shopId = req.query.shopId;
  if (!shopId) return res.status(400).json({ error: '请提供 shopId 参数' });
  if (!/^\d+$/.test(shopId)) return res.status(400).json({ error: 'shopId 必须为数字' });

  console.log(`\n📸 ====== 截图请求: shopId=${shopId} ======`);

  try {
    const buffer = await captureShop(shopId);
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="shop_${shopId}.png"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache',
    });
    res.send(buffer);
    console.log(`✅ 响应已发送: shop_${shopId}.png`);
  } catch (err) {
    console.error(`❌ 截图失败:`, err.message);
    res.status(500).json({ error: '截图失败', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║  淘宝/天猫店铺截图服务已启动          ║
  ║  端口: ${PORT}                          ║
  ║  支持: 淘宝店 + 天猫店自动识别        ║
  ║  截图: /screenshot?shopId=店铺ID      ║
  ╚══════════════════════════════════════╝
  `);
});
