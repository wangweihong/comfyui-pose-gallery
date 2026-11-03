// Random-node messages extend the shared gallery vocabulary.
(function(root){
  const EN={
  "姿态体系":"Pose system", "姿态视角":"Pose view", "人像类型":"Reference type",
  "本次随机姿态预览": "Random pose preview",
  "随机姿态预览加载失败，请检查素材原图。": "The random preview could not load. Check the original image.",
  "上次运行结果": "Last execution result",
  "运行工作流后自动抽取姿态": "A pose reference is drawn automatically when the workflow runs",
  "随机来源": "Random source",
  "点击骰子预览，或运行工作流自动抽取姿态": "Click the dice to preview, or run the workflow to draw a pose",
  "正在抽取姿态…": "Drawing a pose…",
  "🔒 已锁定": "🔒 Locked",
  "🎲 随机": "🎲 Random",
  "随机姿态": "Draw a random pose",
  "仅更新此节点预览，不运行工作流": "Update this preview without running the workflow",
  "当前姿态编号": "Current pose ID",
  "🔒 锁定随机": "🔒 Lock random selection",
  "随机失败，请重试": "Could not draw a pose. Try again",
  "请先点击骰子选择姿态，再锁定": "Draw a pose before locking",
  "无效的姿态编号": "Invalid pose ID",
  "all：全部；builtin：内置；user：自定义。": "all: all references; builtin: bundled; user: custom uploads.",
  "控制界面、description 和 action 输出语言，随工作流保存。": "Controls the UI, description, and action output language. Saved with the workflow.",
  "当前选择的姿态，锁定后运行工作流使用此图。": "The selected pose. Workflow runs keep this reference while locked.",
  "保持当前姿态并禁用骰子。": "Keep the current pose and disable the dice.",
  "界面与提示语言": "UI / error language",
  "图像": "Image",
  "宽度": "Width",
  "高度": "Height",
  "姿态编号": "Pose ID",
  "描述": "Description",
  "参考类型": "Reference type",
  "英文关键词": "English keywords"
};
  const LANGUAGE_KEY="pose-gallery-random-language";
  const normalize=value=>value==='en'?'en':'zh';
  function preferred(){try{return normalize(localStorage.getItem(LANGUAGE_KEY));}catch{return 'zh';}}
  function persist(value){try{localStorage.setItem(LANGUAGE_KEY,normalize(value));}catch{}}
  function translate(text,language){return language==='en'?(EN[text]??root.PoseGalleryI18n?.translate(text,language)??text):text;}
  const api={preferred,persist,normalize,translate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RandomPoseI18n=api;
})(typeof window!=='undefined'?window:globalThis);
