// Uses the temporary synthetic library served by serve_management_fixture.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); } catch {}
const base = process.env.POSE_MANAGEMENT_TEST_URL;
test('edit groups, delete or replace one view, and reconcile updates without selecting images', {skip:!chromium||!base}, async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-proxy-server']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(8000);
    assert.equal((await page.request.post(base+'/_fixture/reset')).ok(),true,'test requires the isolated fixture server');
    if (process.env.POSE_MANAGEMENT_LEGACY_TEST) {
      await page.route('**/manage/summary', route => route.fulfill({status:404,json:{error:'not_found'}}));
      await page.route('**/manage/plan', route => {
        if (route.request().postDataJSON().choices) return route.fulfill({status:400,json:{error:'invalid_request'}});
        return route.continue();
      });
      await page.route('**/manage/apply', async route => {
        const response = await route.fetch(), result = await response.json();
        delete result.counts; await route.fulfill({response,json:result});
      });
    }
    const errors=[], applies=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/manage/apply'))applies.push(request.url());});
    const status=async()=>await(await page.request.get(base+'/pose_gallery/manage')).json();
    const update=async()=>{await page.request.post(base+'/_fixture/update');};
    await page.goto(base+'/pose_gallery/gallery?lang=zh',{waitUntil:'domcontentloaded'});
    await page.locator('.pose-card').first().waitFor();
    await page.locator('#library-manager-open').click();
    const global=page.locator('#library-manager');
    await global.getByText('还没有删除或替换过内置素材。',{exact:true}).waitFor();
    assert.equal(await global.locator('img,input').count(),0,'global actions do not show image selection');
    assert.equal(applies.length,0);
    await global.getByRole('button',{name:'关闭',exact:true}).click();
    // Editing uses the actual pose cards, and selecting one group deletes all its views.
    await page.locator('#gallery-edit-toggle').click();
    await page.locator('[data-select-group]').first().check();
    assert.equal(await page.locator('[data-select-group]:checked').count(),1);
    assert.equal(await page.locator('#viewer').isVisible(),false);
    await page.locator('#gallery-delete-selected').click();
    const deletion=page.locator('#pose-delete-dialog');
    await deletion.getByText(/1 组姿势及其全部 5 个视角/).waitFor();
    assert.equal(await deletion.locator('select').count(),0);
    await page.locator('#pose-delete-confirm').click();
    await deletion.waitFor({state:'hidden'});
    assert.equal((await status()).records.filter(row=>row.management_state==='removed').length,5);
    assert.equal(await page.locator('.pose-card').count(),1);
    await page.locator('#gallery-edit-toggle').click();
    // The detail viewer has only contextual Delete / Replace buttons, below Open.
    await page.locator('.pose-card').click();
    const identity=await page.locator('#viewerId').textContent();
    assert.equal(await page.locator('#manage-current-asset').count(),0);
    await page.locator('#replace-current-asset').click();
    const replace=page.locator('#pose-replace-dialog');
    assert.equal(await replace.locator('select').count(),0);
    assert.equal(await replace.locator('input[type=checkbox]').count(),0);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
    await page.locator('#pose-replacement-file').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:png});
    await page.locator('#pose-replace-confirm').click();
    await replace.waitFor({state:'hidden'});
    assert.equal((await status()).records.find(row=>row.id===identity).management_state,'replace');
    assert.equal(await page.locator('#viewerId').textContent(),identity);
    await page.locator('#viewerClose').click();
    // An updater restores files. Opening the gallery still does not change them.
    await update(); await page.reload({waitUntil:'domcontentloaded'});
    assert.ok((await status()).records.every(row=>row.installed_original));
    await page.locator('#library-manager-open').click();
    await page.locator('#library-update-apply').waitFor();
    await page.waitForFunction(()=>!document.querySelector('#library-update-apply').disabled);
    assert.equal(await global.locator('img,input').count(),0);
    assert.equal(await global.locator('select').count(),2);
    // Continue both actions, with no image selections or extra preview screen.
    await page.locator('#library-update-apply').click();
    await page.locator('#library-update-status').getByText(/删除 5 个视角，替换 1 个视角，保留 0 个视角；失败 0 个/).waitFor();
    let rows=(await status()).records;
    assert.equal(rows.filter(row=>!row.installed_original).length,5);
    // Keep updated replacements while continuing earlier deletions.
    await update();
    await page.locator('#update-replaced-choice').selectOption('keep');
    await page.locator('#library-update-apply').click();
    await page.locator('#library-update-status').getByText(/删除 5 个视角，替换 0 个视角，保留 1 个视角；失败 0 个/).waitFor();
    rows=(await status()).records;
    assert.equal(rows.find(row=>row.id===identity).management_state,'default');
    assert.equal(rows.filter(row=>!row.installed_original).length,5);
    // Keep previously deleted assets after an update; no thumbnail picking.
    await update();
    await page.locator('#update-deleted-choice').selectOption('keep');
    await page.locator('#library-update-apply').click();
    await page.locator('#library-update-status').getByText(/保留 5 个视角；失败 0 个/).waitFor();
    assert.ok((await status()).records.every(row=>row.management_state==='default'&&row.installed_original));
    await global.getByRole('button',{name:'关闭',exact:true}).click();
    // Single-view deletion must leave the other four views intact.
    await page.locator('.pose-card').first().click();
    await page.locator('#delete-current-asset').click();
    await deletion.getByText(/只删除当前选中的视角/).waitFor();
    await page.locator('#pose-delete-confirm').click();
    await deletion.waitFor({state:'hidden'});
    assert.equal((await status()).records.filter(row=>row.management_state==='removed').length,1);
    // Switch language and inspect the compact global dialog on mobile.
    await page.locator('#gallery-language').selectOption('en');
    await page.locator('#library-manager-open').click();
    await page.waitForFunction(()=>!document.querySelector('#library-update-apply').disabled);
    assert.doesNotMatch(await global.innerText(),/[\u3400-\u9fff]/);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await global.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    if(process.env.POSE_MANAGEMENT_SCREENSHOT_DIR){
      fs.mkdirSync(process.env.POSE_MANAGEMENT_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.POSE_MANAGEMENT_SCREENSHOT_DIR,'update-mobile.png')});
      await page.setViewportSize({width:1440,height:1000});
      await page.screenshot({path:path.join(process.env.POSE_MANAGEMENT_SCREENSHOT_DIR,'update-desktop.png')});
      await global.getByRole('button',{name:'Close',exact:true}).click();
      await page.locator('#gallery-edit-toggle').click();
      await page.screenshot({path:path.join(process.env.POSE_MANAGEMENT_SCREENSHOT_DIR,'edit-groups.png')});
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
