/* Deck controller: scaling, navigation, step reveals, typing, story tracker, notes. */
(function () {
  "use strict";

  var stage = document.getElementById("stage");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var numEl = document.getElementById("num");
  var notes = document.getElementById("notes");
  var notesBody = document.getElementById("notes-body");
  var tracker = document.getElementById("tracker");
  var trackerBadges = tracker.querySelectorAll(".badge");
  var trackerLbl = document.getElementById("tracker-lbl");
  var overlay = document.getElementById("video-overlay");
  var video = document.getElementById("demo-video");
  var reduced = /[?&]calm/.test(location.search); // motion is part of the story; add ?calm to the link to turn it off

  var STORY = ["The designer describes the part.", "Similar past models are found.", "The design is checked.", "Options are suggested.",
               "The engineer approves, and CATIA updates a copy.", "The assembly is checked.", "The design is checked against its simulation."];

  var index = -1, step = 0;

  function stepsOf(s) {
    var max = 0;
    s.querySelectorAll("[data-step]").forEach(function (el) { max = Math.max(max, +el.dataset.step); });
    if (s.dataset.track) max = Math.max(max, s.dataset.track.split(",").length - 1);
    if (s.dataset.steps) max = +s.dataset.steps;
    return max;
  }

  // ---------------------------------------------------------- scale to window
  // phones and tablets: touch controls; a phone held upright shows the slide turned sideways so it fills the screen
  var touch = (window.matchMedia && matchMedia("(pointer: coarse)").matches) || ("ontouchstart" in window);
  if (touch) document.body.classList.add("touch");
  var rotated = false;
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    rotated = touch && h > w;
    document.body.classList.toggle("rotated", rotated);
    if (rotated) {
      var kr = Math.min(h / 1920, w / 1080);
      stage.style.transform = "translate(-50%, -50%) rotate(90deg) scale(" + kr + ")";
    } else {
      var k = Math.min(w / 1920, h / 1080);
      stage.style.transform = "translate(-50%, -50%) scale(" + k + ")";
    }
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", function () { setTimeout(fit, 150); });
  fit();

  // ---------------------------------------------------------- typing
  function typeIn(el, animate, delay) {
    var text = el.getAttribute("data-type");
    if (!animate || reduced) { el.textContent = text; return; }
    var p = { n: 0 };
    el.textContent = "";
    gsap.to(p, { n: text.length, duration: Math.min(2.4, 0.35 + text.length * 0.032), delay: delay || 0, ease: "none", overwrite: true,
      onUpdate: function () { el.textContent = text.slice(0, Math.round(p.n)); } });
  }
  function typeWithin(root, animate, delay) {
    root.querySelectorAll("[data-type]").forEach(function (el, i) { typeIn(el, animate, (delay || 0) + i * 0.9); });
  }

  // ---------------------------------------------------------- reveals
  function revealSteps(s, upto, animate) {
    s.querySelectorAll("[data-step]").forEach(function (el) {
      var n = +el.dataset.step, on = n <= upto;
      if (!animate || reduced) { gsap.set(el, { opacity: on ? 1 : 0, y: 0, filter: "blur(0px)" }); if (on) typeWithin(el, false); return; }
      if (on && n === upto) {
        gsap.fromTo(el, { opacity: 0, y: 22, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "expo.out", overwrite: true });
        typeWithin(el, true, 0.2);
        el.querySelectorAll(".mk-lines path").forEach(function (p, k) { gsap.fromTo(p, { strokeDasharray: 600, strokeDashoffset: 600 }, { strokeDashoffset: 0, duration: 1.1, delay: 0.25 + k * 0.12, ease: "power2.out" }); });
      } else if (!on) gsap.to(el, { opacity: 0, duration: 0.2, overwrite: true });
      else gsap.set(el, { opacity: 1, y: 0, filter: "blur(0px)" });
    });
    // strike-through and dimming for filtered candidates
    s.querySelectorAll("[data-strike]").forEach(function (el) {
      var on = upto >= +el.dataset.strike;
      gsap.to(el, { scaleX: on ? 1 : 0, duration: animate && !reduced ? 0.45 : 0, delay: animate && on ? 0.4 : 0, ease: "power3.inOut" });
    });
    s.querySelectorAll("[data-dim]").forEach(function (el) {
      var on = upto >= +el.dataset.dim;
      gsap.to(el, { opacity: on ? 0.42 : 1, duration: animate && !reduced ? 0.4 : 0, delay: animate && on ? 0.8 : 0 });
    });
    s.querySelectorAll("[data-glow]").forEach(function (el) {
      var on = upto >= +el.dataset.glow;
      gsap.to(el, { boxShadow: on ? "0 18px 50px rgba(21,112,239,0.22)" : "0 18px 44px rgba(16,42,67,0.07)", duration: animate ? 0.5 : 0, delay: animate && on ? 0.9 : 0 });
    });
  }

  // ---------------------------------------------------------- slide 2: typographic statements + process line
  function splitWords(root) {
    function wrap(text, parent) {
      text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { parent.appendChild(document.createTextNode(part)); return; }
        var s = document.createElement("span"); s.className = "w"; s.textContent = part; parent.appendChild(s);
      });
    }
    Array.prototype.slice.call(root.childNodes).forEach(function (n) {
      if (n.nodeType === 3) { var f = document.createDocumentFragment(); wrap(n.textContent, f); root.replaceChild(f, n); }
      else if (n.nodeType === 1) { var t = n.textContent; n.textContent = ""; wrap(t, n); }
    });
  }
  document.querySelectorAll("[data-split]").forEach(splitWords);

  var heardState = -1;
  function heard(st, animate) {
    var s1 = document.getElementById("hs-1"), s2 = document.getElementById("hs-2");
    var anim = animate && !reduced;

    function stmt(el, on, play) {
      var num = el.querySelector(".num"), words = el.querySelectorAll(".w"), ctx = el.querySelector(".ctx"), hl = el.querySelector(".hl");
      gsap.killTweensOf([el, num, words, ctx, hl]);
      if (!on) { gsap.set(el, { opacity: 0 }); return; }
      gsap.set(el, { opacity: 1 });
      if (!play) { gsap.set(num, { opacity: 1, y: 0 }); gsap.set(words, { opacity: 1, y: 0, filter: "blur(0px)" }); gsap.set(ctx, { opacity: 1, y: 0 }); gsap.set(hl, { backgroundSize: "100% 6px" }); return; }
      gsap.timeline()
        .fromTo(num, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: "expo.out" }, 0)
        .fromTo(words, { opacity: 0, y: 14, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.45, stagger: 0.075, ease: "power3.out" }, 0.15)
        .fromTo(hl, { backgroundSize: "0% 6px" }, { backgroundSize: "100% 6px", duration: 0.6, ease: "power2.inOut" }, ">-0.05")
        .fromTo(ctx, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, ease: "expo.out" }, "<0.1");
    }

    var playFrom = heardState; // only animate the newly reached step
    stmt(s1, st >= 1, anim && st === 1 && playFrom < 1);
    stmt(s2, st >= 2, anim && st === 2 && playFrom < 2);

    heardState = st;
  }

  // ---------------------------------------------------------- per-slide hooks
  var hooks = {
    "s-heard": function (st, animate) { heard(st, animate); },
    "s-cases": function (st, animate) {
      var b1 = document.getElementById("beat-1"), b2 = document.getElementById("beat-2"), b3 = document.getElementById("beat-3");
      b3.classList.add("ok");
      function set(n) { [b1, b2, b3].forEach(function (b, i) { b.classList.toggle("on", i + 1 <= n); }); }
      if (st < 2) { set(0); return; }
      if (!animate || reduced) { set(3); return; }
      set(0);
      gsap.delayedCall(0.6, function () { set(1); });   // clash shown (3D fades in, then holds at 40 mm)
      gsap.delayedCall(1.8, function () { set(2); });   // holes start moving (World: delay 1.8 s, 2.2 s move)
      gsap.delayedCall(4.0, function () { set(3); });   // clear
    },
    "s-apply": function (st, animate) {
      var btn = document.getElementById("approve"), cur = document.getElementById("cursor");
      if (st < 1) { btn.classList.remove("done"); btn.textContent = "Approve change"; gsap.set(cur, { opacity: 0 }); return; }
      var r = btn.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = sr.width / 1920;
      var tx = (r.left - sr.left) / k + 60, ty = (r.top - sr.top) / k + 26;
      function done() { btn.classList.add("done"); btn.textContent = "✓ Approved by the engineer"; }
      // the click plays once, when the approval step is reached; later steps only show the approved state
      if (!animate || reduced || st !== 1) { gsap.killTweensOf([cur, btn]); done(); gsap.set(cur, { opacity: 0 }); gsap.set(btn, { scale: 1 }); return; }
      gsap.timeline()
        .fromTo(cur, { opacity: 0, x: tx + 260, y: ty + 220 }, { opacity: 1, duration: 0.2 })
        .to(cur, { x: tx, y: ty, duration: 0.9, ease: "power2.inOut" })
        .to(btn, { scale: 0.95, duration: 0.08 })
        .add(done)
        .to(btn, { scale: 1, duration: 0.3, ease: "back.out(2)" })
        .to(cur, { opacity: 0, duration: 0.3 }, "+=0.4");
    },
    "s-record": function (st, animate) {
      var rd = document.getElementById("st-review"), ru = document.getElementById("st-reuse"), dr = document.getElementById("st-draft");
      dr.className = "chip " + (st >= 1 ? "grey" : "draft");
      rd.className = "chip " + (st >= 1 ? "pass" : "grey");
      ru.className = "chip " + (st >= 2 ? "pass" : "grey");
      var card = document.getElementById("record-card");
      if (st >= 2 && animate && !reduced) {
        gsap.timeline()
          .to(card, { scale: 0.97, duration: 0.15 })
          .to(card, { scale: 1, boxShadow: "0 0 0 4px rgba(21,128,61,0.35)", duration: 0.4, ease: "back.out(2)" });
      } else gsap.set(card, { scale: 1, boxShadow: st >= 2 ? "0 0 0 4px rgba(21,128,61,0.35)" : "0 18px 44px rgba(16,42,67,0.07)" });
    },
  };

  var archTween = null;
  function archPulse(s, st) {
    if (archTween) { archTween.kill(); archTween = null; }
    var pulses = document.querySelectorAll("#arch .pulse");
    if (!s || s.id !== "s-arch" || st < 3 || reduced) { gsap.set(pulses, { opacity: 0 }); return; }
    gsap.set(pulses, { opacity: 1, strokeDashoffset: 0 });
    archTween = gsap.to(pulses, { strokeDashoffset: -918, duration: 3, ease: "none", repeat: -1, stagger: 0.3 });
  }

  function updateTracker(s, st, animate) {
    if (!s.dataset.track) { gsap.to(tracker, { opacity: 0, duration: animate ? 0.3 : 0 }); return; }
    var map = s.dataset.track.split(",").map(Number);
    var cur = map[Math.min(st, map.length - 1)];
    var complete = s.id === "s-evidence" && st >= 2;
    trackerBadges.forEach(function (b, i) {
      var n = i + 1;
      b.className = "badge" + (n === cur && !complete ? " on" : n < cur || complete ? " done" : "");
    });
    trackerLbl.textContent = complete ? "Every step is done. The design is ready for review." : STORY[cur - 1];
    gsap.to(tracker, { opacity: 1, duration: animate ? 0.4 : 0 });
  }

  // ---------------------------------------------------------- navigation
  function show(i, st, dir) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    var prev = slides[index], s = slides[i];
    var changed = i !== index, instant = dir === 0, animate = !instant;

    if (changed) {
      if (prev) {
        prev.classList.remove("active");
        if (instant || reduced) gsap.set(prev, { opacity: 0 });
        else gsap.to(prev, { opacity: 0, filter: "blur(6px)", duration: 0.28, ease: "power3.in", onComplete: function () { gsap.set(prev, { filter: "blur(0px)" }); } });
      }
      s.classList.add("active");
      stage.classList.toggle("grey", s.dataset.bg === "grey");
      gsap.set(s, { opacity: 1, filter: "blur(0px)" });
      var anim = s.querySelectorAll("[data-anim]");
      if (instant || reduced) { gsap.set(anim, { opacity: 1, y: 0, filter: "blur(0px)" }); anim.forEach(function (el) { typeWithin(el, false); }); }
      else {
        gsap.fromTo(anim, { opacity: 0, y: 26, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.75, stagger: 0.08, delay: 0.25, ease: "expo.out", overwrite: true });
        anim.forEach(function (el) { typeWithin(el, true, 0.8); });
      }
      index = i;
      if (s.id !== "s-heard") heardState = -1;
      notesBody.textContent = s.dataset.notes || "";
      numEl.textContent = String(i + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    }

    step = Math.max(0, Math.min(stepsOf(s), st));
    var stepAnim = animate && !(changed && dir < 0);
    revealSteps(s, step, stepAnim);
    if (hooks[s.id]) hooks[s.id](step, stepAnim && (changed || dir > 0));
    archPulse(s, step);
    updateTracker(s, step, animate);
    if (window.World && World.ok) World.go(s.dataset.world, step, instant);

    var hash = "#" + (i + 1) + (step ? "." + step : "");
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  function next() {
    var s = slides[index];
    if (step < stepsOf(s)) show(index, step + 1, 1);
    else if (index < slides.length - 1) show(index + 1, 0, 1);
  }
  function prev() {
    if (step > 0) show(index, step - 1, -1);
    else if (index > 0) show(index - 1, stepsOf(slides[index - 1]), -1);
  }

  function toggleVideo(open) {
    var on = open === undefined ? !overlay.classList.contains("open") : open;
    overlay.classList.toggle("open", on);
    if (on) { var pr = video.play(); if (pr && pr.catch) pr.catch(function () {}); } else video.pause();
  }

  document.addEventListener("keydown", function (e) {
    if (overlay.classList.contains("open")) {
      if (e.key === "Escape" || e.key === "v" || e.key === "V") toggleVideo(false);
      return;
    }
    switch (e.key) {
      case "ArrowRight": case "PageDown": case " ": case "Enter": e.preventDefault(); next(); break;
      case "ArrowLeft": case "PageUp": case "Backspace": e.preventDefault(); prev(); break;
      case "Home": show(0, 0, 1); break;
      case "End": show(slides.length - 1, stepsOf(slides[slides.length - 1]), 1); break;
      case "f": case "F":
        if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        else document.exitFullscreen && document.exitFullscreen();
        break;
      case "n": case "N": notes.classList.toggle("open"); break;
      case "v": case "V": toggleVideo(true); break;
      case "b": case "B": case ".": document.body.classList.toggle("blackout"); break;
      case "?": case "h": case "H": document.body.classList.toggle("show-help"); break;
    }
  });
  var swiped = false;
  stage.addEventListener("click", function () { if (swiped) return; next(); });
  // swipe: left = next, right = back (in the slide's own direction, also when it is turned sideways)
  var t0 = null;
  document.addEventListener("touchstart", function (e) {
    if (overlay.classList.contains("open") || e.touches.length !== 1) { t0 = null; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; t0.lx = t0.x; t0.ly = t0.y;
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (t0 && e.touches.length === 1) { t0.lx = e.touches[0].clientX; t0.ly = e.touches[0].clientY; }
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!t0) return;
    var dx = t0.lx - t0.x, dy = t0.ly - t0.y; t0 = null;
    var along = rotated ? dy : dx, across = rotated ? dx : dy;
    if (Math.abs(along) > 45 && Math.abs(along) > Math.abs(across) * 1.3) {
      swiped = true; setTimeout(function () { swiped = false; }, 450);
      if (along < 0) next(); else prev();
    }
  }, { passive: true });
  document.querySelectorAll("#touchnav button").forEach(function (b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); if (b.dataset.nav === "prev") prev(); else next(); });
  });
  stage.addEventListener("contextmenu", function (e) { e.preventDefault(); prev(); });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) toggleVideo(false); });
  var vbtn = document.getElementById("video-btn");
  if (vbtn) vbtn.addEventListener("click", function (e) { e.stopPropagation(); toggleVideo(true); });

  // ---------------------------------------------------------- boot
  function parseHash() {
    var m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash || "");
    return m ? [+m[1] - 1, m[2] ? +m[2] : 0] : [0, 0];
  }
  function boot() {
    if (window.World) World.init(document.getElementById("world"));
    var h = parseHash();
    show(h[0], h[1], /[?&]static\b/.test(location.search) ? 0 : 1);
    document.body.classList.add("show-help");
    setTimeout(function () { document.body.classList.remove("show-help"); }, 4000);
    document.body.classList.add("hint-on");
    setTimeout(function () { document.body.classList.remove("hint-on"); }, 4500);
  }
  var fontsReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('700 54px "MontDeck"'), document.fonts.load('400 24px "PlexDeck"'), document.fonts.load('600 20px "PlexDeck"'), document.fonts.load('400 22px "PlexMonoDeck"')]).catch(function () {})
    : Promise.resolve();
  fontsReady.then(boot);
})();
