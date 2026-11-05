/* Bilingual UI strings. Public surfaces only; the admin tool stays English. */
(function () {
  "use strict";

  const STRINGS = {
    en: {
      "nav-map": "Map",
      "nav-contribute": "Contribute",
      "nav-about": "About",
      "years-title": "Years",
      "all": "All",
      "pre-1900": "Pre-1900",
      "era-label": "Era maps",
      "era-none": "coming soon",
      "opacity": "Opacity",
      "hint": "Tap a photo to read its story",
      "open-photo": "Open photo",
      "share": "Share",
      "copy-link": "Copy link",
      "copied": "Copied",
      "download-card": "Download share card",
      "search-ph": "Search stories…",
      "no-results": "No stories found",
      "all-years": "All years",
      "story-of-day": "Story of the day",
      "read-story": "Read the story",
      "themes": "Themes",
      "nav-voices": "Voices",
      "voices-title": "Voices",
      "voices-lede": "Longer conversations with the people behind the photos. Interviews, told in their own words.",
      "voices-empty": "No interviews yet. The first one is being written.",
      "read-interview": "Read the interview",
      "field-contact": "Open to a longer chat? (optional)",
      "field-contact-ph": "Email or WeChat, kept private",
      "field-contact-help": "Only reviewers see this. If your story could become a longer interview, we'll reach out.",
      "credit-prefix": "Contributed by",
      "seed-prefix": "Photo:",
      "count": function (shown, total) { return shown + " / " + total + " stories"; },
      "fab-add": "Add a photo",
      "lang-next": "中文",
      // submit page
      "submit-title": "Add your Beijing",
      "submit-lede": "One photo, one place, one short story. A volunteer reviewer reads every entry before it joins the map.",
      "step-photo": "Photo",
      "step-story": "Story",
      "step-place": "Place and time",
      "drop-hint": "Drop a photo here or click to choose",
      "drop-formats": "JPEG, PNG, WebP or HEIC, up to 15 MB",
      "use-exif-place": "Use the photo's own location and date",
      "field-title": "Title",
      "field-title-ph": "e.g. Morning at the Zhengyangmen gate",
      "field-story": "Your story",
      "field-story-ph": "What does this photo remember? A moment, a person, a smell of the street...",
      "field-year": "Year",
      "field-year-help": "Your best guess is fine.",
      "field-credit": "Your name (optional)",
      "field-credit-help": "Leave empty to stay anonymous.",
      "pick-hint": "Tap the map to place the photo.",
      "consent-own": "This is my photo, or I have the right to share it.",
      "consent-people": "Any people in it agreed to appear, or are not identifiable.",
      "consent-note": "We store only what you type here and the point you place on the map. Location metadata inside the photo file is removed.",
      "submit-btn": "Send for review",
      "submitting": "Sending...",
      "submit-done-title": "Thank you",
      "submit-done-body": "Your photo is with the reviewers. If it fits the museum, it will appear on the map soon.",
      "submit-more": "Add another photo",
      "err-req": "Please fill in this field",
      "err-photo": "Please choose a photo",
      "err-place": "Please place the photo on the map",
      "err-consent": "Both checkboxes are needed",
      "err-server": "Something went wrong. Please try again.",
      // about page
      "about-title": "About the museum",
      "about-lede": "A living map of Beijing, written by the people who walk it."
    },
    zh: {
      "nav-map": "地图",
      "nav-contribute": "参与",
      "nav-about": "关于",
      "years-title": "年份",
      "all": "全部",
      "pre-1900": "1900年前",
      "era-label": "历史地图",
      "era-none": "即将上线",
      "opacity": "透明度",
      "hint": "点击照片，阅读它的故事",
      "open-photo": "查看原图",
      "share": "分享",
      "copy-link": "复制链接",
      "copied": "已复制",
      "download-card": "下载分享卡片",
      "search-ph": "搜索故事…",
      "no-results": "没有找到相关故事",
      "all-years": "全部年份",
      "story-of-day": "今日故事",
      "read-story": "阅读故事",
      "themes": "主题",
      "nav-voices": "人物",
      "voices-title": "人物",
      "voices-lede": "与照片背后的人的更长对话。访谈，用他们自己的话讲述。",
      "voices-empty": "还没有访谈。第一篇正在写作中。",
      "read-interview": "阅读访谈",
      "field-contact": "愿意深入聊聊吗？（可选）",
      "field-contact-ph": "邮箱或微信，仅审核者可见",
      "field-contact-help": "只有审核者能看到。如果你的故事适合做成更长的访谈，我们会联系你。",
      "credit-prefix": "供稿人",
      "seed-prefix": "照片：",
      "count": function (shown, total) { return shown + " / " + total + " 条故事"; },
      "fab-add": "添加照片",
      "lang-next": "EN",
      "submit-title": "添加你的北京",
      "submit-lede": "一张照片，一个地点，一段小故事。每一条内容都会由志愿者审核后上线。",
      "step-photo": "照片",
      "step-story": "故事",
      "step-place": "地点与时间",
      "drop-hint": "把照片拖到这里，或点击选择",
      "drop-formats": "JPEG、PNG、WebP 或 HEIC，不超过 15 MB",
      "use-exif-place": "使用照片自带的拍摄地点和日期",
      "field-title": "标题",
      "field-title-ph": "例如：正阳门的早晨",
      "field-story": "你的故事",
      "field-story-ph": "这张照片记住了什么？一个瞬间、一个人、一条街的味道……",
      "field-year": "年份",
      "field-year-help": "大致年份也可以。",
      "field-credit": "你的名字（可选）",
      "field-credit-help": "留空即为匿名。",
      "pick-hint": "在地图上点一下，标记照片的位置。",
      "consent-own": "这是我本人的照片，或我有权分享它。",
      "consent-people": "照片中的人物已同意出镜，或无法被识别。",
      "consent-note": "我们只保存你填写的内容和你在地图上标记的点。照片文件里的位置信息会被清除。",
      "submit-btn": "提交审核",
      "submitting": "提交中……",
      "submit-done-title": "谢谢",
      "submit-done-body": "你的照片已进入审核。合适的内容很快会出现在地图上。",
      "submit-more": "再添加一张",
      "err-req": "请填写这一项",
      "err-photo": "请选择一张照片",
      "err-place": "请在地图上标记位置",
      "err-consent": "请勾选两个确认项",
      "err-server": "出了点问题，请重试。",
      "about-title": "关于博物馆",
      "about-lede": "一张由行走在北京的人共同书写的活地图。"
    }
  };

  let lang = localStorage.getItem("lm-lang") || "en";

  function t(key) {
    const v = STRINGS[lang][key] !== undefined ? STRINGS[lang][key] : STRINGS.en[key];
    return typeof v === "function" ? v : v;
  }

  function apply() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = t("lang-next");
  }

  function setLang(l) {
    lang = l;
    localStorage.setItem("lm-lang", l);
    apply();
    document.dispatchEvent(new CustomEvent("lm:langchange", { detail: lang }));
  }

  window.LM = {
    t: t,
    lang: function () { return lang; },
    setLang: setLang,
    apply: apply
  };

  document.addEventListener("DOMContentLoaded", function () {
    apply();
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.addEventListener("click", function () {
      setLang(lang === "en" ? "zh" : "en");
    });
  });
})();
