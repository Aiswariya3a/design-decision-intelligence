/* World3D — one persistent Three.js stage behind the slides.
   The synthetic mounting plate (80 x 30 x 3 mm, two holes) is the hero object from slide 4 to 10.
   All geometry is procedural; lighting is a generated studio environment (no external files). */
(function () {
  "use strict";

  if (THREE.ColorManagement) {
    if ("enabled" in THREE.ColorManagement) THREE.ColorManagement.enabled = true;
    THREE.ColorManagement.legacyMode = false;
  }

  var W = 1920, H = 1080;
  var S = 0.06; // mm -> world units
  var C = {
    navy: 0x102a43, blue: 0x1570ef, pale: 0xe8f1ff, pass: 0x157f3d, fail: 0xc8281c,
    alu: 0xc9d1da, steel: 0x8e97a1, pbt: 0x23282e, slate: 0x627386,
  };
  var LIMITS = { spacing: [38, 46], dia: [5, 6] };

  var renderer, scene, camera, clock, ok = true;
  var reduced = /[?&]calm/.test(location.search); // motion is part of the story; add ?calm to the link to turn it off
  var view = { px: 5.2, py: 4.4, pz: 7.6, tx: 0, ty: 0, tz: 0, shift: 0.2 };
  var anchors = [];
  var R = {}; // rigs and groups
  var histMode = "replay";

  // ------------------------------------------------------------ helpers
  function setBase(m, v) { m.userData.base = v; }
  function fade(obj, v) {
    obj.userData.fade = v;
    obj.visible = v > 0.002;
    obj.traverse(function (o) {
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(function (m) {
        if (m.userData.base === undefined) m.userData.base = m.opacity;
        m.opacity = m.userData.base * v;
        m.transparent = m.opacity < 0.999 || m.userData.forceTransparent === true;
      });
    });
  }
  function fadeTo(obj, v, dur, delay, after) {
    if (!obj.userData.fp) obj.userData.fp = { v: obj.userData.fade || 0 };
    gsap.to(obj.userData.fp, { v: v, duration: dur, delay: delay || 0, ease: "power1.inOut", overwrite: true,
      onUpdate: function () { fade(obj, obj.userData.fp.v); if (after) after(); },
      onComplete: function () { fade(obj, v); if (after) after(); } });
  }
  function basic(color, op) {
    var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    m.userData.forceTransparent = true; setBase(m, op); return m;
  }
  function lineMat(color, op) {
    var m = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: op, toneMapped: false });
    m.userData.forceTransparent = true; setBase(m, op); return m;
  }
  function shadowCatcher(size, op) {
    var m = new THREE.ShadowMaterial({ opacity: op, transparent: true });
    m.userData.forceTransparent = true; setBase(m, op);
    var g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    g.rotation.x = -Math.PI / 2; g.position.y = -0.01; g.receiveShadow = true;
    return g;
  }
  function roundedRect(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function addAnchor(id, obj, local) {
    var el = document.getElementById(id);
    if (!el) return null;
    var a = { el: el, obj: obj, local: local, o: { v: 0 } };
    anchors.push(a); return a;
  }
  function anchor(id) { for (var i = 0; i < anchors.length; i++) if (anchors[i].el.id === id) return anchors[i]; return null; }

  // brushed-metal streaks (seeded, so every run looks the same)
  function brushedTexture() {
    var cv = document.createElement("canvas"); cv.width = 1024; cv.height = 128;
    var x = cv.getContext("2d"), seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    x.fillStyle = "#8a8a8a"; x.fillRect(0, 0, 1024, 128);
    for (var i = 0; i < 900; i++) {
      var v = Math.floor(110 + rnd() * 70);
      x.fillStyle = "rgba(" + v + "," + v + "," + v + ",0.35)";
      x.fillRect(rnd() * 1024, rnd() * 128, 80 + rnd() * 500, 1);
    }
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 80, 1 / 10);
    return t;
  }

  // studio environment for realistic reflections
  function studioEnvironment() {
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: 0xb9c0c9, side: THREE.BackSide })));
    function panel(w, h, x, y, z, rx, ry, k) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
    }
    panel(12, 6, 0, 5.9, 0, Math.PI / 2, 0, 3.0);   // soft box above
    panel(6, 8, -9.9, 1, 0, 0, Math.PI / 2, 1.8);   // left strip
    panel(4, 8, 9.9, 1, 3, 0, -Math.PI / 2, 1.3);   // right strip
    panel(10, 2, 0, 1.5, 9.9, 0, Math.PI, 1.1);     // front fill
    var gen = new THREE.PMREMGenerator(renderer);
    var tex = gen.fromScene(env, 0.035).texture;
    gen.dispose();
    return tex;
  }

  // ------------------------------------------------------------ the plate rig
  var brushed = null;
  function makeRig(opt) {
    opt = opt || {};
    var g = new THREE.Group();
    var inner = new THREE.Group(); inner.rotation.x = -Math.PI / 2; inner.scale.setScalar(S); g.add(inner);

    var plateMat = new THREE.MeshStandardMaterial({
      color: opt.color || C.alu, metalness: opt.metal !== undefined ? opt.metal : 0.88, roughness: opt.rough !== undefined ? opt.rough : 0.36,
      roughnessMap: opt.plain ? null : brushed,
    });
    var plate = new THREE.Mesh(new THREE.BufferGeometry(), plateMat);
    plate.castShadow = true; plate.receiveShadow = true; inner.add(plate);
    var edges = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(C.navy, opt.edge !== undefined ? opt.edge : 0.28));
    inner.add(edges);

    var ringMat = basic(C.blue, 0.95);
    var rings = [0, 1].map(function () { var r = new THREE.Mesh(new THREE.RingGeometry(1, 2, 64), ringMat); inner.add(r); return r; });

    var zones = new THREE.Group();
    var zoneMat = basic(C.pass, 0.3);
    [-1, 1].forEach(function (s) {
      var z = new THREE.Mesh(new THREE.PlaneGeometry((LIMITS.spacing[1] - LIMITS.spacing[0]) / 2, 22), zoneMat);
      z.position.set(s * (LIMITS.spacing[0] + LIMITS.spacing[1]) / 4, 0, 3.44); zones.add(z);
    });
    inner.add(zones);

    var dimMat = basic(C.navy, 1);
    var dims = new THREE.Group(); inner.add(dims);

    var ghostMat = basic(C.fail, 0.95);
    var ghostFill = basic(C.fail, 0.2);
    var ghost = new THREE.Group();
    [0, 1].forEach(function () {
      var gg = new THREE.Group();
      gg.add(new THREE.Mesh(new THREE.RingGeometry(1, 1.4, 64), ghostMat));
      gg.add(new THREE.Mesh(new THREE.CircleGeometry(1, 64), ghostFill));
      ghost.add(gg);
    });
    inner.add(ghost);

    g.add(shadowCatcher(40, 0.16));

    var rig = {
      g: g, inner: inner, plate: plate, edges: edges, rings: rings, ringMat: ringMat, zones: zones, dims: dims, dimMat: dimMat,
      ghost: ghost, ghostMat: ghostMat, ghostFill: ghostFill,
      p: { sp: 40, d: 5, t: 3 }, gp: { sp: 50, d: 6 }, status: "neutral", dimAnchor: opt.dimAnchor, diaAnchor: opt.diaAnchor, extras: null,
      vis: { rings: { v: 0 }, zones: { v: 0 }, dims: { v: 0 }, ghost: { v: 0 } },
    };
    rig.build = function () { buildRig(rig); };
    return rig;
  }

  function bar(group, m, x1, y1, x2, y2, z, w) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var b = new THREE.Mesh(new THREE.PlaneGeometry(len, w), m);
    b.position.set((x1 + x2) / 2, (y1 + y2) / 2, z); b.rotation.z = Math.atan2(dy, dx); group.add(b);
  }
  function tri(group, m, x, y, dir, z) {
    var s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-3 * dir, 1.2); s.lineTo(-3 * dir, -1.2); s.lineTo(0, 0);
    var t = new THREE.Mesh(new THREE.ShapeGeometry(s), m); t.position.set(x, y, z); group.add(t);
  }
  function statusColor(s) { return s === "fail" ? C.fail : s === "pass" ? C.pass : C.blue; }

  function buildRig(rig) {
    var sp = rig.p.sp, d = rig.p.d, t = rig.p.t;
    var shape = roundedRect(80, 30, 2.5);
    [-1, 1].forEach(function (s) { var h = new THREE.Path(); h.absarc(s * sp / 2, 0, d / 2, 0, Math.PI * 2, true); shape.holes.push(h); });
    var geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 3, curveSegments: 64 });
    rig.plate.geometry.dispose(); rig.plate.geometry = geo;
    rig.edges.geometry.dispose(); rig.edges.geometry = new THREE.EdgesGeometry(geo, 30);

    rig.ringMat.color.setHex(statusColor(rig.status));
    rig.rings.forEach(function (r, i) {
      var s = i ? 1 : -1;
      r.geometry.dispose(); r.geometry = new THREE.RingGeometry(d / 2 + 0.45, d / 2 + 1.4, 64);
      r.position.set(s * sp / 2, 0, t + 0.47);
    });

    var dims = rig.dims;
    while (dims.children.length) { var c = dims.children.pop(); c.geometry.dispose(); }
    rig.dimMat.color.setHex(rig.status === "fail" ? C.fail : rig.status === "pass" ? C.pass : C.navy);
    var z = t + 0.52, yl = -22;
    bar(dims, rig.dimMat, -sp / 2, 0, -sp / 2, yl - 2.5, z, 0.35);
    bar(dims, rig.dimMat, sp / 2, 0, sp / 2, yl - 2.5, z, 0.35);
    bar(dims, rig.dimMat, -sp / 2 + 2.8, yl, sp / 2 - 2.8, yl, z, 0.4);
    tri(dims, rig.dimMat, -sp / 2, yl, -1, z); tri(dims, rig.dimMat, sp / 2, yl, 1, z);

    rig.ghost.children.forEach(function (gg, i) {
      var s = i ? 1 : -1, gd = rig.gp.d / 2;
      gg.position.set(s * rig.gp.sp / 2, 0, t + 0.6);
      gg.children[0].geometry.dispose(); gg.children[0].geometry = new THREE.RingGeometry(gd, gd + 0.6, 64);
      gg.children[1].geometry.dispose(); gg.children[1].geometry = new THREE.CircleGeometry(gd, 64);
    });

    if (rig.extras) rig.extras(rig);

    var cls = rig.status === "fail" ? " fail" : rig.status === "pass" ? " pass" : "";
    var a = rig.dimAnchor && anchor(rig.dimAnchor);
    if (a) { a.local.set(0, yl - 6.5, z); a.el.textContent = sp.toFixed(1) + " mm"; a.el.className = "anchor-label dim-label" + cls; }
    var b = rig.diaAnchor && anchor(rig.diaAnchor);
    if (b) { b.local.set(sp / 2, 13.5, z); b.el.textContent = "Ø " + d.toFixed(1) + " mm"; b.el.className = "anchor-label dim-label" + cls; }
    applyVis(rig);
  }

  function applyVis(rig) {
    var f = rig.g.userData.fade === undefined ? 0 : rig.g.userData.fade;
    fade(rig.g, f);
    function sub(obj, v) {
      obj.visible = f * v > 0.002;
      obj.traverse(function (o) { if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { m.opacity = m.userData.base * f * v; }); } });
    }
    rig.rings.forEach(function (r) { sub(r, rig.vis.rings.v); });
    sub(rig.zones, rig.vis.zones.v); sub(rig.dims, rig.vis.dims.v); sub(rig.ghost, rig.vis.ghost.v);
  }

  // history extras: mating-part bosses and M5 screws (synthetic illustration)
  function addHistoryExtras(rig) {
    var bosses = [], screws = [];
    [-1, 1].forEach(function (s) {
      var pbt = new THREE.MeshStandardMaterial({ color: C.pbt, metalness: 0.0, roughness: 0.62, emissive: 0x000000 });
      var boss = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 7, 40), pbt);
      boss.rotation.x = Math.PI / 2; boss.position.set(s * 14, 0, 3 + 3.5); boss.castShadow = true;
      rig.inner.add(boss); bosses.push(boss);
      var steel = new THREE.MeshStandardMaterial({ color: C.steel, metalness: 0.95, roughness: 0.28, emissive: 0x000000 });
      var sc = new THREE.Group();
      var head = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.25, 3.2, 48), steel); head.rotation.x = Math.PI / 2; head.position.z = 1.6;
      var slot = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x4a525c, metalness: 0.6, roughness: 0.5 }));
      slot.position.z = 3.25;
      head.castShadow = true;
      sc.add(head); sc.add(slot); sc.userData.mat = steel;
      rig.inner.add(sc); screws.push(sc);
    });
    rig.extras = function (r) {
      var hx = r.p.sp / 2, gap = hx - 4.25 - (14 + 3.2), clash = gap < 0;
      screws.forEach(function (sc, i) { sc.position.set((i ? 1 : -1) * hx, 0, r.p.t + 0.35); sc.userData.mat.emissive.setHex(clash ? 0x5a0b06 : 0x000000); });
      bosses.forEach(function (b) { b.material.emissive.setHex(clash ? 0xb01a10 : 0x000000); });
      var a = anchor("a-hist");
      if (a) {
        a.local.set(hx - 2.2, -13, 6);
        if (histMode === "assembly") {
          a.el.textContent = "Tool clearance 8.6 mm · 8 mm needed ✓";
          a.el.className = "anchor-label tag3d pass";
        } else {
          a.el.textContent = clash ? "Overlap of " + Math.abs(gap).toFixed(1) + " mm: the parts clash." : "Gap of " + gap.toFixed(1) + " mm: the parts are clear.";
          a.el.className = "anchor-label tag3d " + (clash ? "fail" : "pass");
        }
        var bl = anchor("a-boss");
        if (bl) bl.el.textContent = histMode === "assembly" ? "No clash with the mating part ✓" : "Boss on the mating part";
      }
    };
  }

  // ------------------------------------------------------------ other groups
  function buildSlab() {
    var g = new THREE.Group();
    var geo = new THREE.ExtrudeGeometry(roundedRect(6.0, 3.4, 0.35), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
    geo.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xcfe0fb, metalness: 0, roughness: 0.55 }));
    m.receiveShadow = true; g.add(m);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lineMat(C.blue, 0.6)));
    g.position.y = -0.42;
    return g;
  }
  function buildScopeBox() {
    var g = new THREE.Group();
    var geo = new THREE.BoxGeometry(6.0, 1.3, 2.8); geo.translate(0, 0.5, 0);
    g.add(new THREE.Mesh(geo, basic(C.blue, 0.05)));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(C.blue, 0.85)));
    return g;
  }
  function buildStairs() {
    var g = new THREE.Group();
    [0.3, 0.62, 0.94, 1.26].forEach(function (h, i) {
      var geo = new THREE.BoxGeometry(2.3, h, 2.2); geo.translate(0, h / 2, 0);
      var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i === 0 ? C.blue : (i === 3 ? 0xf3f7fd : 0xe3eefd), metalness: 0.05, roughness: 0.5 }));
      m.castShadow = true; m.receiveShadow = true;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(i === 0 ? 0xffffff : C.blue, i === 0 ? 0.7 : 0.35)));
      m.position.x = -4.35 + i * 2.9; m.userData.h = h;
      g.add(m);
    });
    g.add(shadowCatcher(40, 0.13));
    g.userData.rise = { v: 1 };
    return g;
  }

  // ------------------------------------------------------------ slide states
  // p = camera position, t = target, shift = picture offset (fraction of width, + moves right)
  var CAM = {
    iso:    { p: [5.0, 4.6, 7.2], t: [0, 0, 0.2] },
    far:    { p: [6.3, 5.9, 9.3], t: [0, 0, 0.35] },
    top:    { p: [0.0, 9.8, 6.6], t: [0, 0, 0.5] },
    wide:   { p: [0.0, 9.4, 9.6], t: [0, 0, 0.9] },
    stairs: { p: [0.0, 5.2, 13.6], t: [0, 1.25, 0] },
    farther:{ p: [10.4, 9.6, 15.0], t: [0, 0, 0.35] },
    hist:   { p: [1.4, 9.0, 8.6], t: [0.3, 0, 1.15] },
    mid:    { p: [5.6, 5.2, 8.2], t: [0, 0, 0.3] },
  };
  var STATES = {
    title: { cam: "iso", shift: 0.2 }, heard: { cam: "iso", shift: 0.2 }, problem: { cam: "iso", shift: 0.2 },
    meet:    { cam: "mid", shift: 0.23, main: 1 },
    ask:     { cam: "mid", shift: -0.23, main: 1 },
    cases:   { cam: "hist", shift: 0.235 },
    request: { cam: "top", shift: -0.22, main: 1 },
    update:  { cam: "wide", shift: 0.0, main: 1, original: 1 },
    blocked: { cam: "top", shift: 0.24, main: 1 },
    record:  { cam: "far", shift: 0.25, main: 1, slab: 1 },
    arch:    { cam: "iso", shift: 0.2 },
    scope:   { cam: "farther", shift: 0.27, main: 1, scope: 1 },
    roadmap: { cam: "stairs", shift: 0.0, stairs: 1 },
    risks:   { cam: "iso", shift: 0.2 },
    market:  { cam: "iso", shift: 0.2 },
    check:   { cam: "mid", shift: 0.23, main: 1 },
    options: { cam: "top", shift: 0.24, main: 1 },
    apply:   { cam: "top", shift: -0.22, main: 1 },
    assembly:{ cam: "hist", shift: 0.235 },
    evidence:{ cam: "wide", shift: 0.0, main: 1, original: 1 },
    reqs:    { cam: "iso", shift: 0.2 },
    trust:   { cam: "iso", shift: 0.2 },
    close:   { cam: "iso", shift: 0.2 },
  };

  var current = null;

  function setParams(rig, sp, d, status, dur) {
    gsap.killTweensOf(rig.p);
    if (!dur || (Math.abs(rig.p.sp - sp) < 1e-3 && Math.abs(rig.p.d - d) < 1e-3)) { rig.p.sp = sp; rig.p.d = d; rig.status = status; rig.build(); return; }
    rig.status = "neutral"; rig.build();
    gsap.to(rig.p, { sp: sp, d: d, duration: dur, ease: "power3.inOut", onUpdate: rig.build,
      onComplete: function () { rig.status = status; rig.build(); } });
  }
  function vis(rig, key, v, dur, delay) {
    gsap.to(rig.vis[key], { v: v, duration: dur ? 0.5 : 0, delay: dur ? (delay || 0) : 0, ease: "power2.out", overwrite: true,
      onUpdate: function () { applyVis(rig); }, onComplete: function () { applyVis(rig); } });
  }

  function go(id, step, instant) {
    if (!ok) return;
    var st = STATES[id] || STATES.title, cam = CAM[st.cam];
    var dur = instant || reduced ? 0 : 1.4;
    var changed = current !== id; current = id;
    var main = R.main, orig = R.original, hist = R.history;

    if (changed) {
      gsap.to(view, { px: cam.p[0], py: cam.p[1], pz: cam.p[2], tx: cam.t[0], ty: cam.t[1], tz: cam.t[2], shift: st.shift, duration: dur, ease: "power2.inOut", overwrite: true });
      fadeTo(main.g, st.main ? 1 : 0, dur ? 0.7 : 0, dur && st.main && !main.g.visible ? 0.4 : 0, function () { applyVis(main); });
      fadeTo(orig.g, st.original ? 1 : 0, dur ? 0.6 : 0, 0, function () { applyVis(orig); });
      fadeTo(R.slab, st.slab ? 1 : 0, dur ? 0.6 : 0, dur ? 0.3 : 0);
      fadeTo(R.scope, st.scope ? 1 : 0, dur ? 0.6 : 0, dur ? 0.3 : 0);
      fadeTo(R.stairs, st.stairs ? 1 : 0, dur ? 0.6 : 0);
      if (id !== "cases" && id !== "assembly") fadeTo(hist.g, 0, dur ? 0.4 : 0, 0, function () { applyVis(hist); });
      if (id === "evidence") {
        orig.p.sp = 40; orig.p.d = 5.5; orig.build();
        if (dur) gsap.fromTo(main.g.position, { x: -3.1 }, { x: 3.1, duration: 1.2, delay: 0.6, ease: "power3.inOut", overwrite: true });
        else gsap.set(main.g.position, { x: 3.1 });
      } else {
        gsap.to(main.g.position, { x: 0, duration: dur, ease: "power3.inOut", overwrite: true });
      }
      if (id === "roadmap") { var rise = R.stairs.userData.rise; rise.v = dur ? 0.02 : 1; gsap.to(rise, { v: 1, duration: dur ? 1.3 : 0, delay: dur ? 0.3 : 0, ease: "power4.out", overwrite: true }); }
    }

    // ---- per-slide plate parameters and overlays
    var want = {};
    var P = { sp: 40, d: 5.5, s: "neutral", rings: 0, zones: 0, dims: 0, ghost: 0, gsp: 50, gd: 6, gcol: C.fail };
    var bluePreview = function () { P.ghost = 1; P.gsp = 45; P.gd = 6; P.gcol = C.blue; P.zones = 1; want["a-preview"] = 1; };
    if (id === "check") { P.dims = 1; P.rings = 1; P.s = "fail"; want["a-dim"] = want["a-dia"] = 1; }
    if (id === "options") { P.dims = 1; want["a-dim"] = want["a-dia"] = 1; if (step >= 1) bluePreview(); }
    if (id === "apply") {
      P.dims = 1; want["a-dim"] = want["a-dia"] = 1;
      if (step < 2) bluePreview(); else { P.sp = 45; P.d = 6; P.s = "pass"; P.rings = 1; P.zones = 1; }
    }
    if (id === "evidence") { P.sp = 45; P.d = 6; P.dims = 1; want["a-lock"] = want["a-copy"] = 1; want["a-dim"] = want["a-dia"] = 1; }
    if (id === "meet" || id === "ask") { P.dims = 1; want["a-dim"] = want["a-dia"] = 1; }
    if (id === "request") {
      P.dims = 1; want["a-dim"] = want["a-dia"] = 1;
      if (step >= 1) { P.ghost = 1; P.gsp = 45; P.gd = 6; P.gcol = C.blue; P.zones = 1; want["a-preview"] = 1; }
    }
    if (id === "update") {
      want["a-lock"] = 1; want["a-copy"] = 1;
      if (step >= 1) { P.sp = 45; P.d = 6; P.dims = 1; P.zones = 1; P.rings = 1; want["a-dim"] = want["a-dia"] = 1; }
      if (step >= 2) P.s = "pass";
    }
    if (id === "blocked") {
      P.sp = 45; P.d = 6; P.s = "pass"; P.rings = 1; P.zones = 1;
      if (step >= 1) { P.ghost = 1; want["a-ghost"] = 1; }
    }
    if (id === "record") { P.sp = 45; P.d = 6; P.s = "pass"; P.rings = 1; want["a-slab"] = 1; }
    if (id === "scope") { P.sp = 45; P.d = 6; }

    main.gp.sp = P.gsp; main.gp.d = P.gd; main.ghostMat.color.setHex(P.gcol); main.ghostFill.color.setHex(P.gcol);
    if (st.main) setParams(main, P.sp, P.d, P.s, dur && !changed ? 1.6 : 0);
    var dl = changed ? 0.8 : 0;
    vis(main, "dims", P.dims, dur, dl);
    vis(main, "zones", P.zones, dur, dl);
    vis(main, "rings", P.rings, dur, dl);
    vis(main, "ghost", P.ghost, dur, dl);
    vis(orig, "dims", 0, 0); vis(orig, "rings", 0, 0);

    // ---- history flashback (slide 6, step 2)
    if (id === "assembly") {
      histMode = "assembly";
      fadeTo(hist.g, 1, dur ? 0.6 : 0, 0, function () { applyVis(hist); });
      vis(hist, "rings", 0, 0); vis(hist, "dims", 0, 0);
      gsap.killTweensOf(hist.p); hist.p.sp = 45; hist.build();
      if (step >= 1) { want["a-hist"] = 1; want["a-boss"] = 1; }
    }
    if (id === "cases") {
      histMode = "replay";
      fadeTo(hist.g, step >= 2 ? 1 : 0, dur ? 0.6 : 0, 0, function () { applyVis(hist); });
      vis(hist, "rings", 0, 0);
      vis(hist, "dims", step >= 2 ? 1 : 0, 0);
      if (step >= 2) {
        want["a-hist"] = 1; want["a-hdim"] = 1; want["a-boss"] = 1;
        gsap.killTweensOf(hist.p);
        if (dur) { hist.p.sp = 40; hist.build(); gsap.to(hist.p, { sp: 45, duration: 2.2, delay: 1.8, ease: "power3.inOut", onUpdate: hist.build }); }
        else { hist.p.sp = 45; hist.build(); }
      }
    }

    if (id === "roadmap") for (var i = 0; i < 4; i++) if (step >= i) want["a-stage-" + i] = 1;

    anchors.forEach(function (a) {
      var on = want[a.el.id] ? 1 : 0;
      gsap.to(a.o, { v: on, duration: dur ? 0.4 : 0, delay: on && dur ? (changed ? 1.0 : 0.3) : 0, ease: "power2.out", overwrite: true });
    });
  }

  // ------------------------------------------------------------ frame loop
  var v3 = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (!reduced && (current === "meet" || current === "record")) R.main.g.rotation.y = Math.sin(t * 0.25) * 0.12;
    else R.main.g.rotation.y += (0 - R.main.g.rotation.y) * Math.min(1, dt * 3);
    if (!reduced && (current === "cases" || current === "assembly")) R.history.g.rotation.y = Math.sin(t * 0.2) * 0.08;

    var rv = R.stairs.userData.rise.v;
    R.stairs.children.forEach(function (m, i) { if (m.userData.h) m.scale.y = Math.max(0.001, Math.min(1, rv * 1.6 - i * 0.2)); });

    camera.position.set(view.px, view.py, view.pz);
    camera.lookAt(view.tx, view.ty, view.tz);
    camera.setViewOffset(W, H, -view.shift * W, 0, W, H);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);

    anchors.forEach(function (a) {
      a.obj.updateMatrixWorld();
      v3.copy(a.local).applyMatrix4(a.obj.matrixWorld).project(camera);
      a.el.style.left = ((v3.x + 1) / 2 * W).toFixed(1) + "px";
      a.el.style.top = ((1 - v3.y) / 2 * H).toFixed(1) + "px";
      a.el.style.opacity = a.o.v.toFixed(3);
    });
  }

  // ------------------------------------------------------------ init
  function init(canvas) {
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch (e) { ok = false; }
    if (!ok || !renderer) { ok = false; canvas.style.display = "none"; return false; }
    // phones show the 1920 x 1080 scene scaled down, so a lower pixel ratio keeps it smooth
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(coarse ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.environment = studioEnvironment();
    camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 200);
    clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dde6, 0.35));
    var key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 10, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
    key.shadow.bias = -0.0004;
    scene.add(key);

    brushed = brushedTexture();
    R.main = makeRig({ dimAnchor: "a-dim", diaAnchor: "a-dia" });
    R.original = makeRig({ color: 0xd7dde4, metal: 0.25, rough: 0.7, edge: 0.2, plain: true });
    R.history = makeRig({ color: 0xc9d1da, metal: 0.6, rough: 0.5, edge: 0.3, plain: true, dimAnchor: "a-hdim" });
    R.original.g.position.x = -3.1;
    addHistoryExtras(R.history);
    R.slab = buildSlab();
    R.scope = buildScopeBox();
    R.stairs = buildStairs();
    [R.main.g, R.original.g, R.history.g, R.slab, R.scope, R.stairs].forEach(function (g) { scene.add(g); fade(g, 0); });

    var m = R.main;
    addAnchor("a-dim", m.inner, new THREE.Vector3(0, -28.5, 3.5));
    addAnchor("a-dia", m.inner, new THREE.Vector3(20, 13.5, 3.5));
    addAnchor("a-copy", m.inner, new THREE.Vector3(0, 23, 3.5));
    addAnchor("a-preview", m.inner, new THREE.Vector3(0, 23, 3.5));
    addAnchor("a-ghost", m.inner, new THREE.Vector3(25, 21, 3.5));
    addAnchor("a-lock", R.original.inner, new THREE.Vector3(0, 23, 3.5));
    addAnchor("a-hist", R.history.inner, new THREE.Vector3(18, -13, 6));
    addAnchor("a-hdim", R.history.inner, new THREE.Vector3(0, -28.5, 3.5));
    addAnchor("a-boss", R.history.inner, new THREE.Vector3(14, 12, 10));
    addAnchor("a-slab", R.slab, new THREE.Vector3(0, 0.15, 1.9));
    var si = 0;
    R.stairs.children.forEach(function (s) { if (s.userData.h) { addAnchor("a-stage-" + si, s, new THREE.Vector3(0, s.userData.h + 0.15, -1.1)); si++; } });

    [R.main, R.original, R.history].forEach(function (r) { r.build(); });
    requestAnimationFrame(frame);
    return true;
  }

  window.World = { init: init, go: go, get ok() { return ok; } };
})();
