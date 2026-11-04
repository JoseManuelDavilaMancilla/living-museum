/* Living Museum of Beijing — contribute form. */
(function () {
  "use strict";

  const state = { file: null, blob: null, lat: null, lng: null, exif: null };
  let map, pin;

  const $ = function (id) { return document.getElementById(id); };

  // ---------- photo pick + preview ----------

  function setPhoto(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showNotice(LM.t("drop-formats"), false); return; }
    state.file = file;
    state.blob = null;
    const dz = $("dropzone");
    dz.classList.add("has-photo");
    dz.innerHTML = "";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = "chosen photo preview";
    dz.appendChild(img);
    readExif(file);
  }

  function readExif(file) {
    if (typeof exifr === "undefined") return;
    exifr.parse(file, { gps: true, tiff: true, ifd0: true })
      .then(function (out) {
        if (!out) return;
        const hasGps = typeof out.latitude === "number" && typeof out.longitude === "number";
        const year = out.DateTimeOriginal ? out.DateTimeOriginal.getFullYear() : null;
        if (!hasGps && !year) return;
        state.exif = {
          lat: out.latitude, lng: out.longitude,
          year: year && year >= 1800 && year <= 2100 ? year : null
        };
        if (hasGps && inBeijing(state.exif.lat, state.exif.lng) && state.exif.year) {
          $("exif-apply").hidden = false;
        }
      })
      .catch(function () { /* unreadable EXIF is normal */ });
  }

  function inBeijing(lat, lng) { return lat > 39.3 && lat < 41.1 && lng > 115.3 && lng < 117.6; }

  // ---------- client-side compression ----------

  async function compress(file) {
    const MAX = 2000;
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch (e) {
      bmp = await new Promise(function (res, rej) {
        const img = new Image();
        img.onload = function () { res(img); };
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const scale = Math.min(1, MAX / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d").drawImage(bmp, 0, 0, cw, ch);
    return new Promise(function (res) {
      canvas.toBlob(function (b) { res(b || file); }, "image/jpeg", 0.88);
    });
  }

  // ---------- place picker ----------

  function initPicker() {
    map = L.map("pick-map", {
      center: [39.906, 116.397], zoom: 12, minZoom: 10, maxZoom: 18,
      zoomControl: true, scrollWheelZoom: true
    });
    LM_tileLayer(L).addTo(map);
    map.on("click", function (ev) { placePin(ev.latlng.lat, ev.latlng.lng); });
  }

  function placePin(lat, lng) {
    if (!inBeijing(lat, lng)) { showNotice(LM.t("err-place"), false); return; }
    state.lat = lat; state.lng = lng;
    if (pin) pin.setLatLng([lat, lng]);
    else {
      pin = L.marker([lat, lng], {
        icon: L.divIcon({
          html: '<div class="pm"><div style="width:100%;height:100%;display:grid;place-items:center;font-size:20px">京</div></div>',
          className: "", iconSize: [46, 46], iconAnchor: [23, 46]
        }),
        draggable: true
      });
      pin.on("dragend", function () {
        const p = pin.getLatLng();
        if (inBeijing(p.lat, p.lng)) { state.lat = p.lat; state.lng = p.lng; }
      });
      pin.addTo(map);
    }
    $("f-place").classList.remove("invalid");
  }

  // ---------- validation + submit ----------

  function mark(id, ok) {
    $(id).classList.toggle("invalid", !ok);
    return ok;
  }

  function showNotice(msg, ok) {
    const n = $("form-notice");
    n.textContent = msg;
    n.classList.toggle("ok", !!ok);
    n.classList.remove("hide");
  }

  async function submit(ev) {
    ev.preventDefault();
    const okTitle = mark("f-title", $("in-title").value.trim().length > 0);
    const okStory = mark("f-story", $("in-story").value.trim().length > 0);
    const okYear = mark("f-year", $("in-year").value !== "" && $("in-year").value >= 1800 && $("in-year").value <= 2100);
    const okPlace = mark("f-place", state.lat !== null);
    const okConsent = $("c-own").checked && $("c-people").checked;
    $("consent-err").style.display = okConsent ? "none" : "block";
    if (!state.file) { showNotice(LM.t("err-photo"), false); return; }
    if (!(okTitle && okStory && okYear && okPlace && okConsent)) return;

    const btn = $("submit-btn");
    btn.disabled = true;
    btn.textContent = LM.t("submitting");
    try {
      if (!state.blob) state.blob = await compress(state.file);
      const fd = new FormData();
      fd.append("photo", state.blob, "photo.jpg");
      fd.append("title", $("in-title").value.trim());
      fd.append("story", $("in-story").value.trim());
      fd.append("year", $("in-year").value);
      fd.append("lat", state.lat);
      fd.append("lng", state.lng);
      fd.append("credit", $("in-credit").value.trim());
      fd.append("language", LM.lang());
      fd.append("consent_own", "on");
      fd.append("consent_people", "on");
      fd.append("website", $("hp-website").value);

      const r = await fetch("/api/submit", { method: "POST", body: fd });
      if (!r.ok) {
        const body = await r.json().catch(function () { return {}; });
        throw new Error(body.detail || "http " + r.status);
      }
      $("submit-form").hidden = true;
      document.querySelector(".card h1").hidden = true;
      document.querySelector(".card .lede").hidden = true;
      $("done-state").hidden = false;
    } catch (e) {
      showNotice(String(e.message || LM.t("err-server")), false);
      btn.disabled = false;
      btn.textContent = LM.t("submit-btn");
    }
  }

  // ---------- wire up ----------

  document.addEventListener("DOMContentLoaded", function () {
    initPicker();

    const dz = $("dropzone"), input = $("photo-input");
    dz.addEventListener("click", function () { input.click(); });
    dz.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.click(); }
    });
    input.addEventListener("change", function () { setPhoto(input.files[0]); });
    ["dragenter", "dragover"].forEach(function (n) {
      dz.addEventListener(n, function (ev) { ev.preventDefault(); dz.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (n) {
      dz.addEventListener(n, function (ev) { ev.preventDefault(); dz.classList.remove("drag"); });
    });
    dz.addEventListener("drop", function (ev) {
      if (ev.dataTransfer.files.length) setPhoto(ev.dataTransfer.files[0]);
    });

    $("exif-apply").addEventListener("click", function () {
      if (!state.exif) return;
      if (state.exif.year) $("in-year").value = state.exif.year;
      if (typeof state.exif.lat === "number") {
        placePin(state.exif.lat, state.exif.lng);
        map.setView([state.exif.lat, state.exif.lng], 15);
      }
      $("exif-apply").hidden = true;
    });

    $("in-story").addEventListener("input", function () {
      $("story-count").textContent = this.value.length + " / 1200";
    });

    $("submit-form").addEventListener("submit", submit);
  });
})();
