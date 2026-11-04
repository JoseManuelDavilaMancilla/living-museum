/* Living Museum of Beijing — map page.
   Photo markers on a Beijing-locked map, filtered by year layers.
   Basemap provider comes from tiles.js (LM_tileLayer). */
(function () {
  "use strict";

  // Historical era overlays, XYZ tiles. Live: MapWarper map 54747 "Peking 1914"
  // (warped city-core sheet, tiles verified 2026-11-04). Dorn 1936 exists on the
  // David Rumsey Collection; wire it after georeferencing (project references.md).
  const ERAS = [
    {
      id: "peking1914",
      name: "Peking, 1914",
      nameZh: "北京 · 1914",
      tileUrl: "https://mapwarper.net/maps/tile/54747/{z}/{x}/{y}.png",
      attribution: "Peking 1914, via MapWarper"
    },
    { id: "dorn", name: "Frank Dorn's Peiping, 1936", nameZh: "老北京风俗地图 · 1936", tileUrl: null }
  ];

  const BEIJING_BOUNDS = [[39.4, 115.4], [41.0, 117.5]];

  let map, cluster, entries = [], filter = "all", playTimer = null;
  const eraLayers = new Map();

  function decadeKey(year) {
    if (year < 1900) return "pre";
    return String(Math.floor(year / 10) * 10);
  }

  function bucketOrder(entries) {
    const keys = new Set(entries.map(function (e) { return decadeKey(e.year); }));
    const order = [];
    if (keys.has("pre")) order.push("pre");
    for (let d = 1900; d <= 2020; d += 10) if (keys.has(String(d))) order.push(String(d));
    return order;
  }

  function bucketLabel(key) {
    if (key === "pre") return LM.t("pre-1900");
    return key + "s";
  }

  function initMap() {
    map = L.map("map", {
      center: [39.906, 116.397],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
      maxBounds: BEIJING_BOUNDS,
      maxBoundsViscosity: 0.8
    });
    LM_tileLayer(L).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");

    cluster = L.markerClusterGroup({
      maxClusterRadius: 56,
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: function (c) {
        const n = c.getChildCount();
        return L.divIcon({
          html: '<div class="lm-cluster' + (n < 10 ? " small" : "") + '">' + n + "</div>",
          className: "",
          iconSize: n < 10 ? [32, 32] : [40, 40]
        });
      }
    });
    map.addLayer(cluster);
    window.__lm_map = map; // test/QA handle
  }

  function markerFor(e) {
    const icon = L.divIcon({
      html: '<div class="pm"><img src="' + e.thumb + '" loading="lazy" alt=""></div>',
      className: "",
      iconSize: [46, 46],
      iconAnchor: [23, 23]
    });
    const m = L.marker([e.lat, e.lng], { icon: icon, riseOnHover: true });
    m.on("click", function () { showDetail(e); });
    return m;
  }

  function visibleEntries() {
    if (filter === "all") return entries;
    return entries.filter(function (e) { return decadeKey(e.year) === filter; });
  }

  function rebuild() {
    cluster.clearLayers();
    const vis = visibleEntries();
    const marks = vis.map(markerFor);
    cluster.addLayers(marks);
    document.getElementById("years-count").textContent = LM.t("count")(vis.length, entries.length);
  }

  function buildChips() {
    const wrap = document.getElementById("decade-chips");
    wrap.innerHTML = "";
    const mk = function (key, label) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (filter === key ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", function () { setFilter(key); });
      wrap.appendChild(b);
    };
    mk("all", LM.t("all"));
    bucketOrder(entries).forEach(function (k) { mk(k, bucketLabel(k)); });
  }

  function setFilter(key, opts) {
    filter = key;
    buildChips();
    const order = bucketOrder(entries);
    const slider = document.getElementById("decade-slider");
    if (key !== "all") {
      const idx = order.indexOf(key);
      if (idx >= 0) { slider.value = String(idx); updateSliderFill(slider); }
    }
    if (!(opts && opts.fromPlay)) stopPlay();
    rebuild();
  }

  function updateSliderFill(slider) {
    const max = Number(slider.max) || 1;
    slider.style.setProperty("--fill", (Number(slider.value) / max * 100) + "%");
  }

  function stopPlay() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
      document.getElementById("play-btn").classList.remove("playing");
    }
  }

  function initControls() {
    const slider = document.getElementById("decade-slider");
    const order = bucketOrder(entries);
    slider.min = "0";
    slider.max = String(Math.max(1, order.length - 1));
    updateSliderFill(slider);
    slider.addEventListener("input", function () {
      updateSliderFill(slider);
      setFilter(order[Number(slider.value)], { fromPlay: true });
    });

    document.getElementById("play-btn").addEventListener("click", function () {
      if (playTimer) { stopPlay(); return; }
      const btn = this;
      btn.classList.add("playing");
      let i = order.indexOf(filter) + 1;
      playTimer = setInterval(function () {
        if (i >= order.length) { stopPlay(); return; }
        slider.value = String(i);
        updateSliderFill(slider);
        setFilter(order[i], { fromPlay: true });
        i += 1;
      }, 1500);
    });

    buildChips();
    rebuild();
  }

  // ---------- detail panel ----------

  let hintHidden = false;
  let currentEntry = null;

  function pairOf(e) {
    if (!e.pair_id) return null;
    return entries.find(function (o) {
      return o.pair_id === e.pair_id && o.id !== e.id;
    }) || null;
  }

  function entryUrl(e) {
    const base = location.pathname.replace(/[^/]*$/, "");
    return location.origin + base + "e/" + e.id + "/";
  }

  function showDetail(e, opts) {
    currentEntry = e;
    const pair = pairOf(e);
    const panel = document.getElementById("detail-panel");

    const photo = document.getElementById("detail-photo");
    const cmp = document.getElementById("compare-wrap");
    if (pair) {
      const older = e.year <= pair.year ? e : pair;
      const newer = older === e ? pair : e;
      photo.hidden = true;
      cmp.hidden = false;
      document.getElementById("cmp-old").src = older.photo;
      document.getElementById("cmp-new").src = newer.photo;
      document.getElementById("cmp-old-year").textContent = older.year;
      document.getElementById("cmp-new-year").textContent = newer.year;
      cmp.style.setProperty("--x", "50%");
      const pairChip = document.getElementById("detail-year-pair");
      pairChip.hidden = false;
      pairChip.textContent = pair.year;
    } else {
      photo.hidden = false;
      cmp.hidden = true;
      document.getElementById("detail-year-pair").hidden = true;
      photo.src = e.photo;
      photo.alt = e.title;
    }
    document.getElementById("detail-photo-link").href = e.photo;
    document.getElementById("detail-year").textContent = e.year;
    document.getElementById("detail-title").textContent = e.title;
    document.getElementById("detail-story").textContent = e.story;
    const creditEl = document.getElementById("detail-credit");
    creditEl.textContent = e.credit
      ? LM.t("credit-prefix") + " · " + e.credit
      : "";
    document.getElementById("share-sheet").hidden = true;
    panel.hidden = false;

    if (!(opts && opts.fromLoad)) {
      const url = location.pathname + "?entry=" + e.id;
      history.replaceState(null, "", url);
    }
    if (!hintHidden) {
      hintHidden = true;
      document.getElementById("map-hint").classList.add("hide");
    }
  }

  function closeDetail() {
    document.getElementById("detail-panel").hidden = true;
    document.getElementById("share-sheet").hidden = true;
    currentEntry = null;
    if (location.search.includes("entry=")) {
      history.replaceState(null, "", location.pathname);
    }
  }

  // then-and-now drag
  function initCompare() {
    const cmp = document.getElementById("compare-wrap");
    let dragging = false;
    const setFromEvent = function (ev) {
      const r = cmp.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      cmp.style.setProperty("--x", (Math.min(0.97, Math.max(0.03, x)) * 100) + "%");
    };
    cmp.addEventListener("pointerdown", function (ev) {
      dragging = true;
      cmp.setPointerCapture(ev.pointerId);
      setFromEvent(ev);
    });
    cmp.addEventListener("pointermove", function (ev) {
      if (dragging) setFromEvent(ev);
    });
    cmp.addEventListener("pointerup", function () { dragging = false; });
    cmp.addEventListener("pointercancel", function () { dragging = false; });
  }

  // ---------- share ----------

  function initShare() {
    const sheet = document.getElementById("share-sheet");
    document.getElementById("share-btn").addEventListener("click", function (ev) {
      ev.stopPropagation();
      sheet.hidden = !sheet.hidden;
    });
    document.addEventListener("click", function (ev) {
      if (!sheet.hidden && !sheet.contains(ev.target) && ev.target.id !== "share-btn") {
        sheet.hidden = true;
      }
    });

    document.getElementById("copy-link").addEventListener("click", function () {
      if (!currentEntry) return;
      const url = entryUrl(currentEntry);
      const done = function () {
        const label = document.getElementById("copy-link-label");
        label.textContent = LM.t("copied");
        setTimeout(function () { label.textContent = LM.t("copy-link"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      }
    });

    document.getElementById("download-card").addEventListener("click", function () {
      if (!currentEntry) return;
      sheet.hidden = true;
      drawShareCard(currentEntry, pairOf(currentEntry));
    });
  }

  function cardFont(px, weight) {
    return (weight || "600") + " " + px +
      "px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Segoe UI', sans-serif";
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { lines.push(line); line = w; if (lines.length === maxLines) break; }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines) {
      let last = lines[maxLines - 1];
      const joined = lines.join(" ");
      if (joined.length < text.trim().length) {
        while (last.length > 4 && ctx.measureText(last + "…").width > maxWidth) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last.replace(/[,;:.!?]+$/, "") + "…";
      }
    }
    return lines;
  }

  async function drawShareCard(e, pair) {
    const W = 1080, H = 1440, M = 72;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FAF7F2";
    ctx.fillRect(0, 0, W, H);

    const img = new Image();
    img.src = e.photo;
    await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; });

    // photo, cover-cropped top area
    const PH = 880;
    const s = Math.max(W / img.width, PH / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (PH - dh) / 2, dw, dh);
    ctx.fillStyle = "#FAF7F2";
    ctx.fillRect(0, PH, W, H - PH);

    // brand block
    ctx.fillStyle = "#B23A2E";
    const sealY = 950;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(M, sealY, 84, 84, 18); ctx.fill();
    } else ctx.fillRect(M, sealY, 84, 84);
    ctx.fillStyle = "#FFF7F2";
    ctx.font = cardFont(46);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("京", M + 42, sealY + 46);
    ctx.textAlign = "left";
    ctx.fillStyle = "#1D1C1A";
    ctx.font = cardFont(44, "700");
    ctx.fillText("Living Museum of Beijing", M + 110, sealY + 30);
    ctx.fillStyle = "#6E6760";
    ctx.font = cardFont(28, "500");
    ctx.fillText("one city, year by year", M + 110, sealY + 70);

    // QR to the story page
    try {
      const qr = qrcode(0, "M");
      qr.addData(entryUrl(e));
      qr.make();
      const n = qr.getModuleCount();
      const qrSize = 150, quiet = 8, cell = qrSize / (n + quiet * 2);
      const qx = W - M - qrSize, qy = sealY + 2;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(qx - 6, qy - 6, qrSize + 12, qrSize + 12);
      ctx.fillStyle = "#1D1C1A";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
          }
        }
      }
    } catch (err) { /* card still ships without QR */ }

    // year line (+ pair years)
    ctx.fillStyle = "#B23A2E";
    ctx.font = cardFont(34, "700");
    ctx.fillText(
      pair ? Math.min(e.year, pair.year) + "  ⇄  " + Math.max(e.year, pair.year) + "  ·  BEIJING"
           : e.year + "  ·  BEIJING",
      M, 1108);

    // title
    ctx.fillStyle = "#1D1C1A";
    ctx.font = cardFont(50, "700");
    const titleLines = wrapLines(ctx, e.title, W - M * 2, 2);
    let y = 1168;
    for (const ln of titleLines) { ctx.fillText(ln, M, y); y += 60; }

    // story excerpt
    ctx.fillStyle = "#3A3631";
    ctx.font = cardFont(30, "400");
    const storyLines = wrapLines(ctx, e.story, W - M * 2, 3);
    y += 4;
    for (const ln of storyLines) { ctx.fillText(ln, M, y); y += 44; }

    // credit
    if (e.credit) {
      ctx.fillStyle = "#A39C94";
      ctx.font = cardFont(24, "500");
      ctx.fillText("· " + e.credit, M, H - 40);
    }

    canvas.toBlob(function (blob) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "living-museum-story-" + e.id + ".png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, "image/png");
  }

  function initDetail() {
    document.getElementById("detail-close").addEventListener("click", closeDetail);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeDetail();
    });
    initCompare();
    initShare();
  }

  // ---------- era overlays ----------

  function initEras() {
    const wrap = document.getElementById("era-toggles");
    ERAS.forEach(function (era) {
      const row = document.createElement("div");
      row.className = "era-item";
      const name = document.createElement("span");
      name.className = "era-name";
      const label = document.createElement("span");
      label.textContent = LM.lang() === "zh" ? era.nameZh : era.name;
      name.appendChild(label);
      if (!era.tileUrl) {
        const s = document.createElement("small");
        s.setAttribute("data-i18n", "era-none");
        s.textContent = LM.t("era-none");
        name.appendChild(s);
      }
      const sw = document.createElement("label");
      sw.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.disabled = !era.tileUrl;
      input.addEventListener("change", function () { toggleEra(era, input.checked); });
      sw.appendChild(input);
      const track = document.createElement("span"); track.className = "track";
      const knob = document.createElement("span"); knob.className = "knob";
      sw.appendChild(track); sw.appendChild(knob);
      row.appendChild(name);
      row.appendChild(sw);
      wrap.appendChild(row);
    });
  }

  function toggleEra(era, on) {
    if (!era.tileUrl) return;
    if (on) {
      const layer = L.tileLayer(era.tileUrl, {
        opacity: 0.55, minZoom: 11, maxZoom: 18,
        attribution: era.attribution || ""
      });
      layer.addTo(map);
      eraLayers.set(era.id, layer);
    } else {
      const layer = eraLayers.get(era.id);
      if (layer) { map.removeLayer(layer); eraLayers.delete(era.id); }
    }
  }

  // ---------- boot ----------

  function boot() {
    initMap();
    initEras();
    initDetail();
    fetch("/api/entries")
      .then(function (r) {
        if (r.ok) return r.json();
        throw new Error("http " + r.status);
      })
      .catch(function () {
        // static snapshot (GitHub Pages): no backend, load the frozen data
        return fetch("entries.json").then(function (r) {
          if (!r.ok) throw new Error("no static data");
          return r.json();
        });
      })
      .then(function (data) {
        entries = data;
        initControls();
        // deep link: /?entry=<id> focuses and opens the story
        const want = Number(new URLSearchParams(location.search).get("entry"));
        const hit = entries.find(function (x) { return x.id === want; });
        if (hit) {
          map.setView([hit.lat, hit.lng], Math.max(map.getZoom(), 15));
          showDetail(hit, { fromLoad: true });
        }
      })
      .catch(function () {
        document.getElementById("years-count").textContent = "—";
        document.getElementById("map-hint").textContent = "Could not load stories";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
