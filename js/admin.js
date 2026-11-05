/* Living Museum of Beijing — review dashboard. Reviewer tool, English only. */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };
  let status = "pending";
  let TAX = []; // taxonomy [{key,en,zh}]
  const miniMaps = [];

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opts));
    if (r.status === 401) { showLogin(); throw new Error("unauthorized"); }
    if (!r.ok) {
      const body = await r.json().catch(function () { return {}; });
      throw new Error(body.detail || ("http " + r.status));
    }
    return r.json();
  }

  function showLogin() {
    $("login-card").hidden = false;
    $("admin-card").hidden = true;
    $("logout-btn").hidden = true;
  }

  function showDesk() {
    $("login-card").hidden = true;
    $("admin-card").hidden = false;
    $("logout-btn").hidden = false;
  }

  // ---------- queue ----------

  function field(id, label, value, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.setAttribute("for", id);
    lab.textContent = label;
    wrap.appendChild(lab);
    let input;
    if (opts.textarea) {
      input = document.createElement("textarea");
      input.rows = 4;
    } else {
      input = document.createElement("input");
      input.type = opts.type || "text";
      if (opts.min) input.min = opts.min;
      if (opts.max) input.max = opts.max;
    }
    input.id = id;
    input.value = value === null || value === undefined ? "" : value;
    wrap.appendChild(input);
    return wrap;
  }

  function cardFor(e) {
    const card = document.createElement("div");
    card.className = "qcard";

    const img = document.createElement("img");
    img.className = "qcard-photo";
    img.src = e.photo;
    img.alt = e.title;
    img.loading = "lazy";
    img.addEventListener("click", function () { window.open(e.photo, "_blank"); });
    card.appendChild(img);

    const body = document.createElement("div");
    body.className = "qcard-body";

    const meta = document.createElement("div");
    meta.className = "qmeta";
    const created = document.createElement("span");
    created.textContent = "submitted " + (e.created_at || "").slice(0, 16).replace("T", " ");
    meta.appendChild(created);
    if (e.review_note) {
      const note = document.createElement("span");
      note.textContent = "note: " + e.review_note;
      meta.appendChild(note);
    }
    body.appendChild(meta);

    const fTitle = field("t-" + e.id, "Title", e.title);
    const fStory = field("s-" + e.id, "Story", e.story, { textarea: true });
    const fYear = field("y-" + e.id, "Year", e.year, { type: "number", min: 1800, max: 2100 });
    const fCredit = field("c-" + e.id, "Credit", e.credit);
    const fPair = field("p-" + e.id, "Pair code (same code on two entries = then/now pair)", e.pair_id);
    body.appendChild(fTitle);
    body.appendChild(fStory);
    body.appendChild(fYear);
    body.appendChild(fCredit);
    body.appendChild(fPair);

    const mapDiv = document.createElement("div");
    mapDiv.className = "minimap";
    mapDiv.id = "m-" + e.id;
    body.appendChild(mapDiv);

    // taxonomy tag toggles (saved immediately)
    const tagBlock = document.createElement("div");
    const tagLabel = document.createElement("span");
    tagLabel.className = "tag-label";
    tagLabel.textContent = "Tags";
    tagBlock.appendChild(tagLabel);
    const tagRow = document.createElement("div");
    tagRow.className = "tagrow";
    const current = new Set(e.tags || []);
    TAX.forEach(function (t) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tagchip" + (current.has(t.key) ? " on" : "");
      b.textContent = t.en;
      b.title = t.key;
      b.addEventListener("click", function () {
        if (current.has(t.key)) current.delete(t.key); else current.add(t.key);
        b.classList.toggle("on", current.has(t.key));
        api("/api/admin/entries/" + e.id + "/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: [...current] })
        }).catch(function (err) { alert(err.message); });
      });
      tagRow.appendChild(b);
    });
    tagBlock.appendChild(tagRow);
    body.appendChild(tagBlock);

    const actions = document.createElement("div");
    actions.className = "qcard-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-ghost";
    saveBtn.textContent = "Save edits";
    saveBtn.addEventListener("click", function () {
      const pos = card._pin ? card._pin.getLatLng() : { lat: e.lat, lng: e.lng };
      api("/api/admin/entries/" + e.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: $("t-" + e.id).value.trim(),
          story: $("s-" + e.id).value.trim(),
          year: Number($("y-" + e.id).value),
          credit: $("c-" + e.id).value.trim(),
          pair_id: $("p-" + e.id).value.trim(),
          lat: pos.lat, lng: pos.lng
        })
      }).then(function () { saveBtn.textContent = "Saved"; setTimeout(function () { saveBtn.textContent = "Save edits"; }, 1400); })
        .catch(function (err) { alert(err.message); });
    });

    if (e.status === "pending") {
      const note = document.createElement("input");
      note.type = "text";
      note.className = "reject-note";
      note.id = "rn-" + e.id;
      note.placeholder = "Reason (kept with the entry)";
      actions.appendChild(note);

      const rejBtn = document.createElement("button");
      rejBtn.type = "button";
      rejBtn.className = "btn btn-ghost";
      rejBtn.textContent = "Reject";
      rejBtn.addEventListener("click", function () {
        const n = $("rn-" + e.id);
        if (!n.classList.contains("show")) { n.classList.add("show"); n.focus(); return; }
        api("/api/admin/entries/" + e.id + "/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: n.value.trim() || null })
        }).then(load).catch(function (err) { alert(err.message); });
      });

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn btn-green";
      okBtn.textContent = "Approve";
      okBtn.addEventListener("click", function () {
        api("/api/admin/entries/" + e.id + "/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: $("rn-" + e.id).value.trim() || null })
        }).then(load).catch(function (err) { alert(err.message); });
      });

      actions.appendChild(saveBtn);
      actions.appendChild(rejBtn);
      actions.appendChild(okBtn);
    } else {
      const statusEl = document.createElement("span");
      statusEl.className = "year-chip";
      statusEl.style.background = e.status === "approved" ? "#E7F3EC" : "";
      statusEl.style.color = e.status === "approved" ? "#1F5E3B" : "";
      statusEl.textContent = e.status;
      actions.appendChild(statusEl);
      actions.appendChild(saveBtn);
    }

    body.appendChild(actions);
    card.appendChild(body);

    // mini-map with movable pin (reviewers fix wrong placements)
    requestAnimationFrame(function () {
      const m = L.map(mapDiv, { center: [e.lat, e.lng], zoom: 14, zoomControl: true, scrollWheelZoom: false });
      LM_tileLayer(L).addTo(m);
      const pin = L.marker([e.lat, e.lng], { draggable: true }).addTo(m);
      card._pin = pin;
      miniMaps.push(m);
    });

    return card;
  }

  async function load() {
    miniMaps.forEach(function (m) { m.remove(); });
    miniMaps.length = 0;
    if (!TAX.length) {
      TAX = await fetch("/api/taxonomy").then(function (r) { return r.json(); }).catch(function () { return []; });
    }
    const list = await api("/api/admin/entries?status=" + status);
    const q = $("queue");
    q.innerHTML = "";
    $("empty-msg").hidden = list.length > 0;
    list.forEach(function (e) { q.appendChild(cardFor(e)); });

    const counts = await api("/api/admin/entries?status=all");
    ["pending", "approved", "rejected"].forEach(function (s) {
      $("n-" + s).textContent = "(" + counts.filter(function (e) { return e.status === s; }).length + ")";
    });
  }

  // ---------- voices (long-form stories) ----------

  let currentStory = null; // null = creating new

  async function showStories() {
    $("queue").hidden = true;
    $("empty-msg").hidden = true;
    $("stories-panel").hidden = false;
    await loadStories();
    await loadLeads();
  }

  async function loadLeads() {
    const list = await api("/api/admin/leads").catch(function () { return []; });
    const box = document.getElementById("leads-box");
    if (!box) return;
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = "<p style='font-size:13px;color:var(--ink-3);margin:0'>No leads yet.</p>";
      return;
    }
    list.forEach(function (l) {
      const row = document.createElement("div");
      row.className = "qmeta";
      row.style.cssText = "font-size:13px;color:#3A3631;display:block;margin-bottom:6px";
      row.textContent = "#" + l.entry_id + " " + (l.entry_title || "") + " · " +
        (l.name || "anonymous") + " · " + l.contact + (l.note ? " · “" + l.note + "”" : "") +
        " · " + (l.created_at || "").slice(0, 16).replace("T", " ");
      box.appendChild(row);
    });
  }

  function showQueue() {
    $("stories-panel").hidden = true;
    $("queue").hidden = false;
  }

  function storyForm() {
    return {
      title: $("st-title").value.trim(),
      interviewee: $("st-who").value.trim(),
      entry_id: $("st-entry").value || null,
      language: $("st-lang").value,
      body: $("st-body").value
    };
  }

  async function saveStory(publish) {
    const f = storyForm();
    if (!f.title || !f.body.trim()) { alert("Title and body are required"); return; }
    const payload = Object.assign({}, f, { status: publish ? "published" : "draft" });
    if (currentStory) {
      await api("/api/admin/stories/" + currentStory, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      const made = await api("/api/admin/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f)
      });
      currentStory = made.id;
      if (publish) {
        await api("/api/admin/stories/" + currentStory, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "published" })
        });
      }
    }
    clearStoryForm();
    await loadStories();
  }

  function clearStoryForm() {
    currentStory = null;
    ["st-title", "st-who", "st-entry", "st-body"].forEach(function (id) { $(id).value = ""; });
    $("st-lang").value = "en";
  }

  async function loadStories() {
    const list = await api("/api/admin/stories");
    const q = $("stories-list");
    q.innerHTML = "";
    list.forEach(function (s) {
      const card = document.createElement("div");
      card.className = "qcard";
      const body = document.createElement("div");
      body.className = "qcard-body";
      const meta = document.createElement("div");
      meta.className = "qmeta";
      meta.textContent = "#" + s.id + " · " + s.status + (s.published_at ? " · " + s.published_at.slice(0, 10) : "") +
        (s.entry_id ? " · entry #" + s.entry_id : "");
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = s.title + (s.interviewee ? " — " + s.interviewee : "");
      const ex = document.createElement("div");
      ex.style.cssText = "font-size:12.5px;color:var(--ink-3)";
      ex.textContent = s.excerpt + "…";
      const actions = document.createElement("div");
      actions.className = "qcard-actions";
      actions.style.marginTop = "0";
      const edit = document.createElement("button");
      edit.className = "btn btn-ghost"; edit.type = "button"; edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        currentStory = s.id;
        $("st-title").value = s.title;
        $("st-who").value = s.interviewee || "";
        $("st-entry").value = s.entry_id || "";
        $("st-lang").value = s.language || "en";
        $("st-body").value = s.body || "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      const pub = document.createElement("button");
      pub.className = "btn btn-green"; pub.type = "button";
      pub.textContent = s.status === "published" ? "Unpublish" : "Publish";
      pub.addEventListener("click", async function () {
        await api("/api/admin/stories/" + s.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: s.status === "published" ? "draft" : "published" })
        });
        await loadStories();
      });
      const del = document.createElement("button");
      del.className = "btn btn-quiet"; del.type = "button"; del.textContent = "Delete";
      del.addEventListener("click", async function () {
        if (!confirm("Delete this story for good?")) return;
        await api("/api/admin/stories/" + s.id, { method: "DELETE" });
        await loadStories();
      });
      body.appendChild(meta); body.appendChild(title); body.appendChild(ex);
      actions.appendChild(edit); actions.appendChild(pub); actions.appendChild(del);
      body.appendChild(actions);
      card.appendChild(body);
      q.appendChild(card);
    });
  }

  function initStories() {
    $("st-save").addEventListener("click", function () { saveStory(false).catch(function (e) { alert(e.message); }); });
    $("st-publish").addEventListener("click", function () { saveStory(true).catch(function (e) { alert(e.message); }); });
    $("st-new").addEventListener("click", clearStoryForm);
  }

  // ---------- boot ----------

  document.addEventListener("DOMContentLoaded", function () {
    $("login-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: $("in-token").value })
      }).then(function (r) {
        if (!r.ok) { $("f-token").classList.add("invalid"); return; }
        $("f-token").classList.remove("invalid");
        $("in-token").value = "";
        showDesk();
        load();
      });
    });

    $("admin-tabs").addEventListener("click", function (ev) {
      const b = ev.target.closest(".admin-tab");
      if (!b) return;
      document.querySelectorAll(".admin-tab").forEach(function (t) { t.classList.toggle("on", t === b); });
      if (b.dataset.status === "stories") {
        showStories().catch(function () {});
      } else {
        status = b.dataset.status;
        showQueue();
        load().catch(function () {});
      }
    });
    initStories();

    $("logout-btn").addEventListener("click", function () {
      fetch("/api/admin/logout", { method: "POST" }).then(showLogin);
    });

    // auto-detect existing session
    fetch("/api/admin/entries?status=pending", { credentials: "same-origin" })
      .then(function (r) {
        if (r.ok) { showDesk(); return load(); }
        throw new Error("no session");
      })
      .catch(function () {});
  });
})();
