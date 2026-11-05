/* Living Museum of Beijing — Voices list page. */
(function () {
  "use strict";

  let MODE = "server"; // set by whichever source loaded

  function articleUrl(id) {
    return MODE === "server" ? "/v/" + id : "voices/" + id + "/";
  }

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

  function render(list) {
    const grid = document.getElementById("voices-grid");
    grid.innerHTML = "";
    document.getElementById("voices-empty").hidden = list.length > 0;
    list.forEach(function (s) { grid.appendChild(cardFor(s)); });
  }

  function boot() {
    fetch("/api/stories")
      .then(function (r) { if (!r.ok) throw new Error("no api"); return r.json(); })
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
