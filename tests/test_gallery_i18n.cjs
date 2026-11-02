// Run with Playwright available: node --test tests/test_gallery_i18n.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('playwright')); } catch {}
const context = vm.createContext({module:{exports:{}}, URLSearchParams});
vm.runInContext(fs.readFileSync(path.join(root, 'web/i18n.mjs'), 'utf8'), context);
const I = context.module.exports;
const labels = JSON.parse(fs.readFileSync(path.join(root, 'web/labels-en.json')));
const rows = JSON.parse(fs.readFileSync(path.join(root, 'library/data/pose-zh.json')));

test('every built-in pose and filter has an English translation', () => {
  for (const row of rows) for (const key of ['体系','分类','姿势名称','角度']) {
    assert.equal(typeof labels[row[key]], 'string', `${row.id}: ${key}`);
    assert.doesNotMatch(labels[row[key]], /[\u3400-\u9fff]/);
    if(key !== '姿势名称') assert.equal(I.translate(row[key], 'en'), labels[row[key]]);
  }
  for (const [zh,en] of Object.entries(I.EN)) {
    assert.deepEqual((zh.match(/\{\w+\}/g)||[]).sort(), (en.match(/\{\w+\}/g)||[]).sort(), zh);
  }
  assert.equal(I.preferred('?lang=en'), 'en');
  assert.equal(I.preferred('?lang=zh'), 'zh');
});

test('English gallery, filters, details, navigation, and language persistence', {skip:!chromium}, async () => {
  const errors = [];
  const catalog = rows.map(row => ({...row, origin:'builtin', name_en:labels[row.姿势名称]}));
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost');
    const relative = url.pathname.replace('/pose_gallery/','');
    if(relative === 'catalog' || relative === 'meta') {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify(relative === 'catalog' ? catalog : {total:rows.length,builtin_count:rows.length,user_count:0}));return;
    }
    const file = relative === 'gallery' ? path.join(root,'web/gallery.html') : relative.startsWith('ui/') ? path.join(root,'web',path.basename(relative)) : relative.startsWith('assets/') ? path.join(root,'library',relative.slice(7)) : null;
    if(!file || !fs.existsSync(file)) {res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.html') ? 'text/html' : file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'image/jpeg');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}/pose_gallery/gallery`;
    await page.goto(base+'?lang=en');
    await page.waitForSelector('.pose-card[data-index]');
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await page.locator('.pose-card h3').first().textContent(), labels[rows[0].姿势名称]);
    const chineseText = () => page.evaluate(() => {
      const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT), found=[];
      while(walker.nextNode()) {
        const node = walker.currentNode, parent=node.parentElement;
        if(!parent || ['SCRIPT','STYLE','OPTION'].includes(parent.tagName) || !parent.getClientRects().length) continue;
        if(/[\u3400-\u9fff]/.test(node.textContent))found.push(node.textContent.trim());
      }
      return found;
    });
    assert.deepEqual(await chineseText(),[]);
    if(await page.locator('#filterToggle').isVisible()) await page.locator('#filterToggle').click();
    assert.doesNotMatch(await page.locator('#categorySelect').textContent(),/[\u3400-\u9fff]/);
    await page.locator('#categorySelect').selectOption('站姿');
    await page.locator('#angleFilter [data-angle="侧面"]').click();
    const count = await page.locator('#resultCount').textContent();
    await page.locator('.pose-card[data-index]').first().click();
    await page.waitForSelector('#viewer:not([hidden])');
    const id = await page.locator('#viewerId').textContent();
    assert.doesNotMatch(await page.locator('#viewerMeta').textContent(),/[\u3400-\u9fff]/);
    assert.deepEqual(await chineseText(),[]);
    await page.locator('#gallery-language').selectOption('zh');
    assert.equal(await page.locator('#viewer').isVisible(),true);
    assert.equal(await page.locator('#viewerId').textContent(),id);
    assert.match(await page.locator('#viewerMeta').textContent(),/当前视角/);
    assert.equal(await page.locator('#categorySelect').inputValue(),'站姿');
    await page.locator('#gallery-language').selectOption('en');
    assert.equal(await page.locator('#viewerId').textContent(),id);
    assert.equal(await page.locator('#resultCount').textContent(),count);
    assert.deepEqual(await chineseText(),[]);
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.locator('#viewerId').textContent(),id);
    assert.deepEqual(await chineseText(),[]);
    await page.keyboard.press('Escape');
    await page.locator('[data-info="guide"]').click();
    assert.doesNotMatch(await page.locator('#infoContent').textContent(),/[\u3400-\u9fff]/);
    await page.locator('#infoClose').click();
    await page.locator('[data-info="notice"]').click();
    assert.doesNotMatch(await page.locator('#infoContent').textContent(),/[\u3400-\u9fff]/);
    await page.locator('#infoClose').click();
    await page.locator('#custom-upload-open').click();
    assert.doesNotMatch(await page.locator('#custom-upload-dialog').textContent(),/[\u3400-\u9fff]/);
    await page.locator('.gallery-upload-actions button').first().click();
    await page.locator('#resetFilters').click();
    await page.locator('#searchInput').fill('contrapposto');
    await page.waitForFunction(() => document.querySelector('#resultCount').textContent.startsWith('1 poses'));
    assert.match(await page.locator('.pose-card h3').textContent(),/contrapposto/);
    await page.locator('#searchInput').fill('no-such-pose-12345');
    await page.waitForSelector('#emptyReset');
    assert.deepEqual(await chineseText(),[]);
    await page.locator('#emptyReset').click();
    await page.locator('#loadMore').click();
    assert.equal(await page.locator('.pose-card[data-index]').count(),120);
    await page.goto(base);await page.waitForSelector('.pose-card[data-index]');
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.goto(base+'?lang=zh');await page.waitForSelector('.pose-card[data-index]');
    assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    assert.equal(await page.locator('#gallery-language').inputValue(),'zh');
    await page.locator('#gallery-language').selectOption('en');
    await page.setViewportSize({width:390,height:844});
    assert.deepEqual(await chineseText(),[]);
    await page.locator('.pose-card[data-index]').first().click();
    assert.doesNotMatch(await page.locator('#viewerMeta').textContent(),/[\u3400-\u9fff]/);
    if(process.env.POSE_GALLERY_SCREENSHOTS) {
      fs.mkdirSync(process.env.POSE_GALLERY_SCREENSHOTS,{recursive:true});
      await page.screenshot({path:path.join(process.env.POSE_GALLERY_SCREENSHOTS,'i18n-mobile-details.png')});
      await page.setViewportSize({width:1440,height:1000});
      await page.screenshot({path:path.join(process.env.POSE_GALLERY_SCREENSHOTS,'i18n-english-details.png')});
    }
    // Empty and unavailable libraries must also update when the language changes.
    await page.route('**/pose_gallery/catalog', route => route.fulfill({json:[]}));
    await page.goto(base+'?lang=zh');await page.waitForSelector('#emptyReset');
    await page.locator('#gallery-language').selectOption('en');
    assert.deepEqual(await chineseText(),[]);
    await page.unroute('**/pose_gallery/catalog');
    await page.route('**/pose_gallery/catalog', route => route.fulfill({status:503,json:{error:'storage_error'}}));
    await page.goto(base+'?lang=zh');
    await page.waitForFunction(() => document.querySelector('#resultCount').textContent === '图库加载失败');
    await page.locator('#gallery-language').selectOption('en');
    assert.equal(await page.locator('#resultCount').textContent(),'Gallery failed to load');
    assert.deepEqual(await chineseText(),[]);
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close();await new Promise(resolve => server.close(resolve));
  }
});
