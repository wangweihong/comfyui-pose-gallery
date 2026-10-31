import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../web/pose_gallery.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '');

async function createPreview() {
  let extension;
  class Element {
    constructor() { this.style = {}; this.children = []; this.attributes = {}; }
    addEventListener() {}
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const widget = { name: 'pose_id', value: 'full_sexy_P031_front' };
  class Node {
    constructor() { this.widgets = [widget]; }
    addWidget() {}
    addDOMWidget(name, type, element) { this.previewBox = element; }
    setSize() {}
    setDirtyCanvas() {}
  }
  vm.runInNewContext(code, {
    app: { registerExtension(value) { extension = value; }, graph: { change() {} } },
    api: { apiURL(path) { return '/api' + path; } },
    document: { createElement() { return new Element(); } },
    window: { removeEventListener() {} },
  });
  await extension.beforeRegisterNodeDef(Node, { name: 'PoseGallery' });
  const node = new Node();
  node.onNodeCreated();
  const [image, status] = node.previewBox.children;
  return { widget, image, status };
}

test('missing original shows the exact path and repair instructions instead of a blank node', async () => {
  const { image, status } = await createPreview();
  assert.equal(image.src, '/api/pose_gallery/assets/img/full_sexy_P031_front.png');
  image.onerror();
  assert.equal(image.style.display, 'none');
  assert.equal(status.style.display, 'grid');
  assert.match(status.textContent, /library\/img\/full_sexy_P031_front\.png/);
  assert.match(status.textContent, /git pull/);
  assert.equal(status.attributes.role, 'status');
});

test('a successful selection clears the previous error and displays the original', async () => {
  const { widget, image, status } = await createPreview();
  image.onerror();
  widget.value = 'full_sexy_P031_side';
  widget.callback();
  image.onload();
  assert.equal(image.style.display, 'block');
  assert.equal(status.style.display, 'none');
  assert.equal(image.src, '/api/pose_gallery/assets/img/full_sexy_P031_side.png');
});

test('an older request cannot blank a newly selected pose', async () => {
  const { widget, image, status } = await createPreview();
  const previousError = image.onerror;
  widget.value = 'full_sexy_P031_side';
  widget.callback();
  previousError();
  assert.equal(image.style.display, 'block');
  assert.equal(status.style.display, 'none');
});
