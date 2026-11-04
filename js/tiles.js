/* Single source of truth for basemap tiles across map, submit and admin.
   amap: key-free, fast in mainland China. osm: universal fallback.
   (CARTO raster tiles now require an API key, dropped 2026-11-04.) */
(function () {
  "use strict";

  var TILES = {
    amap: {
      url: "https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=en&style=7",
      subdomains: "1234",
      attribution: "&copy; <a href='https://www.amap.com/'>Amap</a>"
    },
    osm: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      subdomains: "abc",
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
    }
  };

  var PROVIDER = "amap";

  window.LM_tileLayer = function (L) {
    var t = TILES[PROVIDER];
    return L.tileLayer(t.url, {
      subdomains: t.subdomains,
      attribution: t.attribution,
      detectRetina: true
    });
  };
})();
