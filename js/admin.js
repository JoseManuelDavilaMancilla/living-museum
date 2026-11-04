/* Living Museum of Beijing — review dashboard. Reviewer tool, English only. */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };
  let status = "pending";
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
      status = b.dataset.status;
      document.querySelectorAll(".admin-tab").forEach(function (t) { t.classList.toggle("on", t === b); });
      load().catch(function () {});
    });

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
