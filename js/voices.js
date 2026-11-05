/* Living Museum of Beijing — Voices list page. */
(function () {
  "use strict";

  let MODE = "server"; // set by whichever source loaded
  let ENTRIES = [];

  function articleUrl(id) {
    return MODE === "server" ? "/v/" + id : "voices/" + id + "/";
  }

  function mapUrl(entryId) {
    return MODE === "server" ? "/?entry=" + entryId : "index.html?entry=" + entryId;
  }

  const PLACEHOLDER_TOPICS = [
    "The story behind this photograph",
    "One photo, one afternoon, retold",
    "What this place remembers"
  ];

  function cardFor(s) {
    const a = document.createElement("a");
    a.className = "voice-card";
    a.href = articleUrl(s.id);
    if (s.entry) {
      const img = document.createElement("img");
      img.className = "voice-cover";
      img.src = s.entry.thumb;
      img.alt = "";
      a.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "voice-cover voice-cover-empty";
      ph.textContent = "京";
      a.appendChild(ph);
    }
    const body = document.createElement("div");
    body.className = "voice-body";
    if (s.interviewee) {
      const who = document.createElement("span");
      who.className = "voice-who";
      who.textContent = s.interviewee;
      body.appendChild(who);
    }
    const t = document.createElement("span");
    t.className = "voice-title";
    t.textContent = s.title;
    body.appendChild(t);
    const ex = document.createElement("span");
    ex.className = "voice-excerpt";
    ex.textContent = (s.excerpt || "") + "…";
    body.appendChild(ex);
    if (s.entry) {
      const link = document.createElement("span");
      link.className = "voice-entry-link";
      link.textContent = s.entry.title + " · " + s.entry.year;
      body.appendChild(link);
    }
    a.appendChild(body);
    return a;
  }

  // Reserved slots tied to real photographs, until real interviews fill them.
  function placeholderFor(entry, i) {
    const a = document.createElement("a");
    a.className = "voice-card placeholder";
    a.href = mapUrl(entry.id);
    const wrap = document.createElement("div");
    wrap.className = "voice-cover-wrap";
    const img = document.createElement("img");
    img.className = "voice-cover";
    img.src = entry.thumb;
    img.alt = "";
    const badge = document.createElement("span");
    badge.className = "voice-badge";
    badge.textContent = LM.t("voices-reserved");
    wrap.appendChild(img);
    wrap.appendChild(badge);
    a.appendChild(wrap);
    const body = document.createElement("div");
    body.className = "voice-body";
    const who = document.createElement("span");
    who.className = "voice-who";
    who.textContent = entry.title + " · " + entry.year;
    const t = document.createElement("span");
    t.className = "voice-title";
    t.textContent = PLACEHOLDER_TOPICS[i % PLACEHOLDER_TOPICS.length];
    const ex = document.createElement("span");
    ex.className = "voice-excerpt";
    ex.textContent = LM.t("voices-placeholder");
    body.appendChild(who);
    body.appendChild(t);
    body.appendChild(ex);
    a.appendChild(body);
    return a;
  }

  function pickPlaceholderEntries(stories) {
    const taken = new Set(stories.map(function (s) { return s.entry_id; }));
    // Prefer the data-side reservation flag (same set the map panel shows).
    const flagged = ENTRIES.filter(function (e) { return e.voice_reserved && !taken.has(e.id); });
    if (flagged.length) return flagged.slice(0, Math.max(0, 3 - stories.length));
    const free = ENTRIES.filter(function (e) { return !taken.has(e.id) && !e.voice_id; });
    if (!free.length) return [];
    free.sort(function (a, b) { return a.year - b.year; });
    const want = Math.max(0, 3 - stories.length);
    if (want <= 0) return [];
    // spread across time: oldest, middle, newest
    const picks = [];
    for (let i = 0; i < want; i++) {
      const idx = Math.round((free.length - 1) * (want === 1 ? 0.5 : i / (want - 1)));
      if (!picks.includes(free[idx])) picks.push(free[idx]);
    }
    return picks;
  }

  function render(list) {
    const grid = document.getElementById("voices-grid");
    grid.innerHTML = "";
    document.getElementById("voices-empty").hidden = list.length > 0;
    list.forEach(function (s) { grid.appendChild(cardFor(s)); });
    pickPlaceholderEntries(list).forEach(function (e, i) {
      grid.appendChild(placeholderFor(e, i));
    });
  }

  function loadEntries() {
    return fetch("/api/entries")
      .then(function (r) { if (!r.ok) throw new Error("no api"); return r.json(); })
      .catch(function () { return fetch("entries.json").then(function (r) { return r.json(); }); })
      .catch(function () { return []; });
  }

  function boot() {
    loadEntries()
      .then(function (entries) {
        ENTRIES = entries;
        return fetch("/api/stories").then(function (r) {
          if (!r.ok) throw new Error("no api");
          return r.json();
        });
      })
      .then(function (list) { MODE = "server"; render(list); })
      .catch(function () {
        fetch("stories.json")
          .then(function (r) { if (!r.ok) throw new Error("no static"); return r.json(); })
          .then(function (list) { MODE = "static"; render(list); })
          .catch(function () {
            document.getElementById("voices-empty").hidden = false;
          });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
