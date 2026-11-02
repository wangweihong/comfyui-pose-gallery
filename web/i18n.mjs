// Shared interface translations; canonical catalog values and IDs stay unchanged.
(function(root){
  'use strict';
  const EN = {
  "动作":"Action",
  "界面与输出语言":"UI / output language",
  "图像":"Image", "宽度":"Width", "高度":"Height", "姿态编号":"Pose ID", "描述":"Description",
  "返回姿势参考库首页":"Return to pose gallery home",
  "AI 姿势参考库｜288 组人体姿势 · 1439 张多角度参考图": "AI Pose Gallery · 288 poses · 1,439 reference images",
  "POSE Atlas 首页": "POSE Atlas home",
  "帮助与来源": "Help and sources",
  "使用指南": "Guide",
  "注意事项": "Usage notes",
  "访问我们的 GitHub 仓库": "Visit our GitHub repository",
  "访问我们的 X 主页": "Visit our X profile",
  "AI POSE REFERENCE · 中文版图库": "AI POSE REFERENCE · POSE GALLERY",
  "AI 姿势参考库": "AI Pose Reference Gallery",
  "找到你想要的每一个姿势": "Find the pose you need",
  "多角度人体素体线稿，适用于 AI 绘画、构图与动作参考。按体系、分类、视角筛选，一键下载原图。": "Multi-angle figure drawings for AI art, composition, and pose reference. Filter by system, category, and view, then download the original.",
  "图库统计": "Gallery statistics",
  "组姿势": "poses",
  "张参考图": "reference images",
  "种视角": "views",
  "图库筛选": "Gallery filters",
  "体系分类": "Pose systems",
  "搜索姿势名、编号、ID 或分类": "Search pose names, numbers, IDs, or categories",
  "搜索姿势": "Search poses",
  "清空搜索": "Clear search",
  "筛选": "Filters",
  "动作分类": "Action category",
  "全部分类": "All categories",
  "视角": "View",
  "按视角筛选": "Filter by view",
  "展示方式": "Display mode",
  "切换展示方式": "Change display mode",
  "按姿势分组": "Group by pose",
  "逐张浏览": "Browse images",
  "重置筛选": "Reset filters",
  "姿势图库列表": "Pose gallery",
  "正在加载图库…": "Loading gallery…",
  "悬停缩略图切换角度 · 点击查看原图": "Hover thumbnails to change views · Click for full size",
  "当前筛选条件": "Active filters",
  "加载更多": "Load more",
  "POSE Atlas 中文版": "POSE Atlas",
  "· 图片与原始数据版权归原作者ギア所有 · 中文版由 Anhao 整理维护": "· Images and original data © ギア · Chinese edition maintained by Anhao",
  "来源：": "Source:",
  "· 使用图片前请阅读注意事项，图片数据的再分发、转载与再售以原作者条款为准。": "· Read the usage notes before using images. Redistribution, republication, and resale are subject to the original creator's terms.",
  "GitHub 源码": "GitHub source",
  "关闭大图": "Close image viewer",
  "正在加载原图…": "Loading full-size image…",
  "上一个角度": "Previous view",
  "下一个角度": "Next view",
  "姿势详情": "Pose details",
  "复制 ID": "Copy ID",
  "切换视角": "Change view",
  "使用此姿势 → ComfyUI": "Use pose → ComfyUI",
  "下载原尺寸 PNG": "Download full-size PNG",
  "新窗口打开": "Open in new tab",
  "切换角度": "Change view",
  "切换姿势": "Change pose",
  "关闭 · 手机可左右滑动切换角度": "Close · Swipe left or right to change views",
  "关闭": "Close",
  "全部": "All",
  "全部视角": "All views",
  "{images} 张 · {poses} 组": "{images} images · {poses} poses",
  "查看{angle}视角": "View: {angle}",
  "{name}，{angle}视角": "{name}, {angle} view",
  "体系：{value}": "System: {value}",
  "分类：{value}": "Category: {value}",
  "视角：{value}": "View: {value}",
  "搜索：{value}": "Search: {value}",
  "移除此筛选": "Remove this filter",
  "{poses} 组姿势 · {images} 张图片": "{poses} poses · {images} images",
  "{count} 张图片": "{count} images",
  "已显示 {shown} / {total} {unit}": "Showing {shown} / {total} {unit}",
  "共 {total} {unit}": "{total} {unit} in total",
  "组": "poses",
  "张": "images",
  "没有找到匹配的姿势": "No matching poses",
  "试试更换关键词或减少筛选条件。": "Try another keyword or fewer filters.",
  "清除全部筛选": "Clear all filters",
  "加载更多（剩余 {count} {unit}）": "Load more ({count} {unit} remaining)",
  "原图加载失败，可点击新窗口重试": "Image failed to load. Try opening it in a new tab.",
  "体系": "System",
  "姿势编号": "Pose number",
  "当前视角": "Current view",
  "图片规格": "Image specifications",
  "切换到{angle}": "Switch to {angle}",
  "已复制": "Copied",
  "请手动复制": "Copy manually",
  "当前姿势 ID：{id}（请从 ComfyUI 节点打开以应用）": "Pose ID: {id} (open from a ComfyUI node to apply)",
  "当前节点：{id}": "Current node: {id}",
  "图库加载失败": "Gallery failed to load",
  "无法读取姿势数据": "Cannot read pose data",
  "请确认通过 HTTP 服务访问页面，并检查 data/pose-zh.json 是否存在。": "Open this page through the HTTP server and check that data/pose-zh.json exists.",
  "重新加载": "Reload",
  "所选姿势预览": "Selected pose preview",
  "浏览姿势图库 · 搜索 / 分类 / 多视角": "Browse poses · Search / Categories / Views",
  "Pose Gallery · 选择姿势和视角后，点击「使用此姿势」": "Pose Gallery · Choose a pose and view, then click Use pose",
  "人体姿势参考图库": "Human pose reference gallery",
  "原图加载失败：library/img/{id}.png。请在节点目录执行 git pull 更新完整图库，重启 ComfyUI 后刷新浏览器。若使用自定义图库目录，请确认该目录包含对应原图。": "Failed to load library/img/{id}.png. Run git pull in the node directory to update the full library, restart ComfyUI, and refresh the browser. For a custom library directory, check that the original image exists.",
  "全身单人・性感系": "Full body · Sensual",
  "全身单人・标准系": "Full body · Standard",
  "上半身单人": "Upper body · Solo",
  "双人缠绵": "Couples",
  "自定义": "Custom",
  "未分类": "Unspecified",
  "站姿": "Standing",
  "坐姿": "Seated",
  "跪立・四肢着地": "Kneeling / All fours",
  "趴卧": "Lying down",
  "特殊": "Special",
  "跪立": "Kneeling",
  "侧坐・女孩坐": "Side sitting / W-sitting",
  "蹲姿": "Squatting",
  "前倾": "Leaning forward",
  "后仰・挺背": "Leaning back / Arched back",
  "扭身": "Twisting",
  "可爱系": "Cute gestures",
  "挤胸・强调事业线系": "Cleavage emphasis",
  "性感・大胆系": "Sensual / Bold",
  "立位": "Standing position",
  "贴脸系": "Faces close together",
  "正常位（传教士）": "Missionary position",
  "后入位": "Rear-entry position",
  "坐位": "Seated position",
  "背向坐位": "Rear-facing seated position",
  "骑乘位": "Straddling position",
  "侧卧位": "Side-lying position",
  "面对面坐位": "Face-to-face seated position",
  "立位贴身": "Standing embrace",
  "坐位贴身": "Seated embrace",
  "贴身": "Close embrace",
  "正面": "Front",
  "俯视": "High angle",
  "仰视": "Low angle",
  "侧面": "Side",
  "斜侧": "Three-quarter"
};
  const normalize = value => value === 'en' ? 'en' : 'zh';
  function preferred(search = root.location?.search || '') {
    const value = new URLSearchParams(search).get('lang');
    if(value === 'en' || value === 'zh') return value;
    try { return normalize(root.localStorage?.getItem('gallery-upload-language')); } catch { return 'zh'; }
  }
  function translate(source, language, values = {}) {
    const template = language === 'en' ? (EN[source] ?? source) : source;
    return String(template).replace(/\{(\w+)\}/g, (match,key) => values[key] ?? match);
  }
  const originals = new WeakMap();
  function translateDOM(container, language) {
    function visit(node) {
      if(node.nodeType === 3) {
        let source = originals.get(node);
        if(source === undefined) { source = node.textContent; originals.set(node,source); }
        const trimmed = source.trim();
        if(EN[trimmed]) node.textContent = source.replace(trimmed,translate(trimmed,language));
        return;
      }
      if(node.nodeType !== 1 || ['SCRIPT','STYLE'].includes(node.tagName)) return;
      for(const attr of ['aria-label','title','placeholder']) {
        const key = 'data-i18n-' + attr;
        if(!node.hasAttribute(key) && node.hasAttribute(attr)) node.setAttribute(key,node.getAttribute(attr));
        if(node.hasAttribute(key)) node.setAttribute(attr,translate(node.getAttribute(key),language));
      }
      [...node.childNodes].forEach(visit);
    }
    visit(container);
  }
  let catalogPromise;
  function loadCatalog(url) {
    if(!catalogPromise) catalogPromise = fetch(url).then(response => {
      if(!response.ok) throw new Error('Cannot load pose translations');
      return response.json();
    }).then(rows => {
      rows.filter(row => row.origin !== 'user' && row.name_en).forEach(row => {EN[row.姿势名称] = row.name_en;});
      return rows;
    }).catch(error => {catalogPromise = null; throw error;});
    return catalogPromise;
  }
  const api = {EN,normalize,preferred,translate,translateDOM,loadCatalog};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PoseGalleryI18n = api;
})(typeof window !== 'undefined' ? window : globalThis);
