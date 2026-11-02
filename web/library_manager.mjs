/* Explicit user actions only: group deletion, one-view replacement, update reconciliation. */
(function () {
  'use strict';
  const words = {
    manage: ['管理内置素材', 'Manage built-in assets'],
    globalTitle: ['更新后处理内置素材', 'Handle assets after an update'],
    globalHelp: ['更新插件后，在这里统一处理之前删除和替换的素材，无需重新选图。', 'After updating the plugin, handle earlier deletions and replacements here without selecting images again.'],
    globalNote: ['选择保留内置素材后，将不再继续之前的删除或替换。这里不会下载素材；尚未恢复的文件会在报告中提示。', 'Keeping built-in assets also stops the corresponding earlier deletion or replacement. This does not download assets; missing files are reported.'],
    deleted: ['以前删除的姿势', 'Previously deleted poses'],
    replaced: ['以前替换的姿势', 'Previously replaced poses'],
    continueDelete: ['继续删除', 'Delete again'],
    keepDeleted: ['保留更新后的内置姿势', 'Keep the updated built-in poses'],
    continueReplace: ['使用我的替换图', 'Use my replacement images'],
    keepReplaced: ['使用更新后的内置图', 'Use the updated built-in images'],
    execute: ['执行', 'Apply'], close: ['关闭', 'Close'], cancel: ['取消', 'Cancel'],
    delete: ['删除', 'Delete'], replace: ['替换', 'Replace'],
    deleteTitle: ['删除姿势', 'Delete poses'], replaceTitle: ['替换当前视角', 'Replace this view'],
    deleteView: ['只删除当前选中的视角，其他视角不受影响。', 'Delete only the selected view. Other views are kept.'],
    deleteNote: ['删除后会释放本机空间。插件更新后，可在顶部“管理内置素材”中决定是否继续删除。', 'Deletion frees local storage. After an update, use Manage built-in assets to decide whether to delete these poses again.'],
    replaceHelp: ['选择一张正确的姿势图片，替换当前视角。其他视角不受影响。', 'Choose a corrected pose image for this view. Other views are kept.'],
    limits: ['支持 PNG、JPEG、WebP，最多 20 MiB、3200 万像素。', 'PNG, JPEG or WebP, up to 20 MiB and 32 megapixels.'],
    choose: ['选择图片', 'Choose image'], noFile: ['尚未选择图片', 'No image selected'],
    empty: ['还没有删除或替换过内置素材。', 'No built-in assets have been deleted or replaced.'],
    working: ['正在处理…', 'Working…'],
    invalid_selection: ['没有可操作的内置姿势。', 'No built-in poses are selected.'],
    plan_changed: ['素材已发生变化，请重试。', 'Assets changed. Please retry.'],
    replacement_missing: ['替换图片缺失或损坏，请重新选择图片。', 'Replacement image is missing or damaged. Choose it again.'],
    update_required: ['内置图片还未恢复，请先更新素材后再选择保留。', 'Built-in images have not been restored. Update the assets before keeping them.'],
    unsafe_path: ['文件路径异常，无法处理。', 'An unsafe file path prevented this operation.'],
    storage_error: ['操作失败，请检查目录权限和可用空间。', 'Operation failed. Check permissions and free space.'],
    invalid_management_data: ['无法读取之前的操作记录。', 'Cannot read earlier operations.'],
    file_too_large: ['图片超过 20 MiB。', 'Image exceeds 20 MiB.'],
    too_many_pixels: ['图片超过 3200 万像素。', 'Image exceeds 32 megapixels.'],
    unsupported_format: ['仅支持静态 PNG、JPEG、WebP。', 'Only static PNG, JPEG and WebP are supported.'],
    animated_image: ['不支持动画图片。', 'Animated images are not supported.'],
    invalid_image: ['无法读取图片，请重新选择。', 'Cannot read image. Choose another file.'],
    failed: ['操作失败，请重试。', 'Operation failed. Please retry.']
  };
  function element(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }
  function mount(config) {
    let language = config.language, busy = false, summary = null, targets = [], groupCount = 0;
    let replacement = null, file = null, objectURL = null, legacyService = false, lastResult = null;
    const t = key => (words[key] || words.failed)[language === 'en' ? 1 : 0];
    const label = value => window.PoseGalleryI18n.translate(value, language);
    const text = (node, key) => { node.textContent = t(key); };
    const bindings = [];
    function bound(tag, key, className) {
      const node = element(tag, className);
      bindings.push([node, key]);
      return node;
    }
    function button(key, id) {
      const node = bound('button', key);
      node.type = 'button';
      if (id) node.id = id;
      return node;
    }
    function dialog(id, title) {
      const node = element('dialog', 'pose-action-dialog'); node.id = id;
      const header = element('div', 'pose-action-header');
      const heading = bound('h2', title); heading.id = id + '-title';
      node.setAttribute('aria-labelledby', heading.id);
      const close = button('close'); close.onclick = () => { if (!busy) node.close(); };
      header.append(heading, close); node.append(header); document.body.append(node);
      node.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      return node;
    }
    function statusNode(id) {
      const node = element('p', 'pose-action-status'); node.id = id;
      node.setAttribute('role', 'status'); return node;
    }
    const feedback = statusNode('gallery-action-status'); feedback.hidden = true;
    config.feedback.append(feedback);
    const open = button('manage', 'library-manager-open'); config.toolbar.append(open);
    const global = dialog('library-manager', 'globalTitle');
    const globalHelp = bound('p', 'globalHelp'), globalCount = element('p');
    const deletionLabel = element('label', 'pose-update-choice'), deletionText = element('span'), deletionChoice = element('select');
    deletionChoice.id = 'update-deleted-choice'; deletionLabel.append(deletionText, deletionChoice);
    const replacementLabel = element('label', 'pose-update-choice'), replacementText = element('span'), replacementChoice = element('select');
    replacementChoice.id = 'update-replaced-choice'; replacementLabel.append(replacementText, replacementChoice);
    const globalNote = bound('p', 'globalNote', 'pose-action-note');
    const apply = button('execute', 'library-update-apply'), globalStatus = statusNode('library-update-status');
    global.append(globalHelp, globalCount, deletionLabel, replacementLabel, globalNote, apply, globalStatus);
    const deletion = dialog('pose-delete-dialog', 'deleteTitle');
    const deleteDescription = element('p'), deleteNote = bound('p', 'deleteNote', 'pose-action-note');
    const deleteActions = element('div', 'pose-action-buttons'), deleteCancel = button('cancel'), deleteConfirm = button('delete', 'pose-delete-confirm');
    const deleteStatus = statusNode('pose-delete-status');
    deleteConfirm.className = 'pose-danger'; deleteCancel.onclick = () => deletion.close();
    deleteActions.append(deleteCancel, deleteConfirm); deletion.append(deleteDescription, deleteNote, deleteActions, deleteStatus);
    const replace = dialog('pose-replace-dialog', 'replaceTitle');
    const replaceTarget = element('p'), replaceHelp = bound('p', 'replaceHelp'), limits = bound('p', 'limits', 'pose-action-note');
    const picker = element('div', 'pose-file-picker'), choose = button('choose'), filename = element('span'), input = element('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true; input.id = 'pose-replacement-file';
    choose.onclick = () => input.click(); picker.append(choose, filename, input);
    const preview = element('img', 'pose-replacement-preview'); preview.alt = ''; preview.hidden = true;
    const replaceActions = element('div', 'pose-action-buttons'), replaceCancel = button('cancel'), replaceConfirm = button('replace', 'pose-replace-confirm');
    const replaceStatus = statusNode('pose-replace-status'); replaceCancel.onclick = () => replace.close();
    replaceActions.append(replaceCancel, replaceConfirm); replace.append(replaceTarget, replaceHelp, limits, picker, preview, replaceActions, replaceStatus);
    function fillChoice(select, values, fallback) {
      const old = select.value || fallback;
      select.replaceChildren(...values.map(([value, key]) => new Option(t(key), value)));
      select.value = old;
    }
    function draw() {
      bindings.forEach(([node, key]) => text(node, key));
      fillChoice(deletionChoice, [['delete', 'continueDelete'], ['keep', 'keepDeleted']], 'delete');
      fillChoice(replacementChoice, [['replace', 'continueReplace'], ['keep', 'keepReplaced']], 'replace');
      const deleted = summary?.deleted_count || 0, replaced = summary?.replaced_count || 0;
      const views = language === 'en' ? 'views' : '个视角';
      deletionText.textContent = `${t('deleted')} · ${deleted} ${views}`;
      replacementText.textContent = `${t('replaced')} · ${replaced} ${views}`;
      globalCount.textContent = summary && deleted + replaced === 0 ? t('empty') : '';
      deletionLabel.hidden = summary !== null && deleted === 0;
      replacementLabel.hidden = summary !== null && replaced === 0;
      filename.textContent = file?.name || t('noFile');
      if (replacement) replaceTarget.textContent = `${label(replacement.姿势名称)} · ${label(replacement.角度)}`;
      if (groupCount) deleteDescription.textContent = language === 'en'
        ? `Delete ${groupCount} selected pose groups and all ${targets.length} views?`
        : `删除选中的 ${groupCount} 组姿势及其全部 ${targets.length} 个视角？`;
      else if (targets[0]) deleteDescription.textContent = `${label(targets[0].姿势名称)} · ${label(targets[0].角度)}\n${t('deleteView')}`;
      [global, deletion, replace].forEach(node => node.querySelectorAll('button,input,select').forEach(control => { control.disabled = busy; }));
      apply.disabled = busy || !summary || deleted + replaced === 0;
      deleteConfirm.disabled = busy || targets.length === 0;
      replaceConfirm.disabled = busy || !replacement || !file;
      if (lastResult) feedback.textContent = report(lastResult);
    }
    async function request(route, data) {
      const options = {credentials: 'same-origin'};
      if (data !== undefined) {
        options.method = 'POST'; options.body = data instanceof FormData ? data : JSON.stringify(data);
        if (!(data instanceof FormData)) options.headers = {'Content-Type': 'application/json'};
      }
      const response = await fetch(new URL(route, location.href), options);
      if (response.status === 404) throw Error('not_found');
      const value = await response.json();
      if (!response.ok) throw Error(value.error || 'failed');
      return value;
    }
    async function run(status, work) {
      if (busy) return;
      busy = true; status.textContent = t('working'); status.setAttribute('role', 'status'); draw();
      try { await work(); }
      catch (error) { status.textContent = t(error.message); status.setAttribute('role', 'alert'); }
      finally { busy = false; draw(); }
    }
    async function execute(data) {
      if (data.choices && legacyService) return executeLegacyUpdate(data.choices);
      const plan = await request('manage/plan', data);
      const result = await request('manage/apply', {request: plan.request, token: plan.token});
      return normalize(result, plan);
    }
    function normalize(result, plan) {
      if (result.counts) return result;
      const completed = new Set(result.completed), counts = {deleted: 0, replaced: 0, kept: 0};
      plan.items.filter(item => completed.has(item.id)).forEach(item => {
        counts[item.mode === 'default' ? 'kept' : item.mode === 'replace' ? 'replaced' : 'deleted']++;
      });
      return {...result, counts};
    }
    async function refreshSummary() {
      try { summary = await request('manage/summary'); legacyService = false; }
      catch (error) {
        if (error.message !== 'not_found') throw error;
        // Existing ComfyUI sessions keep working until their next normal restart.
        legacyService = true;
        const rows = (await request('manage')).records;
        summary = {deleted_count: rows.filter(row => ['removed', 'thumb_only'].includes(row.management_state)).length,
                   replaced_count: rows.filter(row => row.management_state === 'replace').length};
      }
    }
    async function executeLegacyUpdate(choices) {
      const rows = (await request('manage')).records;
      const result = {completed: [], failures: [], release_bytes: 0, orphan_ids: [], counts: {deleted: 0, replaced: 0, kept: 0}};
      const batches = [
        [rows.filter(row => ['removed', 'thumb_only'].includes(row.management_state)), choices.deleted === 'delete' ? 'removed' : 'default'],
        [rows.filter(row => row.management_state === 'replace'), choices.replaced === 'replace' ? 'replace' : 'default']
      ];
      for (const [assets, mode] of batches) {
        const eligible = assets.filter(row => {
          if (mode !== 'default' || (row.installed_original && row.installed_thumb)) return true;
          result.failures.push({id: row.id, error: 'update_required'}); return false;
        });
        if (!eligible.length) continue;
        try {
          const batch = await execute({ids: eligible.map(row => row.id), mode});
          result.completed.push(...batch.completed); result.failures.push(...batch.failures);
          result.release_bytes += batch.release_bytes;
          for (const key of Object.keys(result.counts)) result.counts[key] += batch.counts[key];
        } catch (error) { eligible.forEach(row => result.failures.push({id: row.id, error: error.message})); }
      }
      return result;
    }
    function report(result) {
      const counts = result.counts;
      const message = language === 'en'
        ? `Finished: ${counts.deleted} views deleted, ${counts.replaced} replaced, ${counts.kept} kept; ${result.failures.length} failed.`
        : `处理完成：删除 ${counts.deleted} 个视角，替换 ${counts.replaced} 个视角，保留 ${counts.kept} 个视角；失败 ${result.failures.length} 个。`;
      const released = result.release_bytes > 0
        ? (language === 'en' ? ` Freed ${(result.release_bytes / 1048576).toFixed(2)} MiB.` : ` 释放 ${(result.release_bytes / 1048576).toFixed(2)} MiB。`) : '';
      const skipped = (result.orphan_ids || []).filter(id => !result.completed.includes(id)).length;
      const missing = skipped ? (language === 'en' ? ` ${skipped} unavailable assets skipped.` : ` 另有 ${skipped} 个当前版本中不存在的素材已跳过。`) : '';
      return message + released + missing + result.failures.map(item => `\n${item.id}：${t(item.error)}`).join('');
    }
    async function changed(result, keepId) {
      await config.onChanged({keepId});
      lastResult = result;
      feedback.textContent = report(result); feedback.hidden = false;
    }
    open.onclick = () => {
      deletionChoice.value = 'delete'; replacementChoice.value = 'replace';
      summary = null; globalStatus.textContent = ''; draw(); global.showModal();
      run(globalStatus, async () => { await refreshSummary(); globalStatus.textContent = ''; });
    };
    apply.onclick = () => run(globalStatus, async () => {
      const result = await execute({choices: {deleted: deletionChoice.value, replaced: replacementChoice.value}});
      await changed(result); await refreshSummary(); globalStatus.textContent = report(result);
    });
    deleteConfirm.onclick = () => run(deleteStatus, async () => {
      const result = await execute({ids: targets.map(row => row.id), mode: 'removed'});
      await changed(result); deleteStatus.textContent = report(result);
      if (!result.failures.length) deletion.close();
    });
    input.onchange = () => {
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = null; file = input.files[0] || null; preview.hidden = true; replaceStatus.textContent = '';
      if (file?.size > 20 * 1024 * 1024) { file = null; input.value = ''; replaceStatus.textContent = t('file_too_large'); }
      if (file) { objectURL = URL.createObjectURL(file); preview.src = objectURL; preview.hidden = false; }
      draw();
    };
    replaceConfirm.onclick = () => run(replaceStatus, async () => {
      const data = new FormData(); data.append('id', replacement.id); data.append('image', file);
      const plan = await request('manage/replacement', data);
      const result = normalize(await request('manage/apply', {request: plan.request, token: plan.token}), plan);
      await changed(result, replacement.id); replaceStatus.textContent = report(result);
      if (!result.failures.length) replace.close();
    });
    replace.addEventListener('close', () => {
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = null; file = null; input.value = ''; preview.hidden = true;
    });
    draw();
    return {
      deleteAssets(rows, groups = 0) {
        targets = rows.filter(row => row.origin === 'builtin'); groupCount = groups;
        deleteStatus.textContent = ''; draw(); if (targets.length) deletion.showModal();
      },
      replaceAsset(row) {
        if (!row || row.origin !== 'builtin') return;
        replacement = row; replaceStatus.textContent = ''; draw(); replace.showModal();
      },
      setLanguage(value) { language = value; draw(); }
    };
  }
  window.PoseLibraryManager = {mount};
})();
