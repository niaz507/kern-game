(function () {
  "use strict";

  var REF = 200;
  var INK = 48;

  var playView = document.getElementById("play-view");
  var finalView = document.getElementById("final-view");
  var phaseLabel = document.getElementById("phase-label");
  var roundTitle = document.getElementById("round-title");
  var roundCount = document.getElementById("round-count");
  var specimen = document.getElementById("specimen");
  var noteEl = document.getElementById("note");
  var stick = document.getElementById("stick");
  var lettersEl = document.getElementById("letters");
  var ghostsEl = document.getElementById("ghosts");
  var caption = document.getElementById("caption");
  var nudge = document.getElementById("nudge");
  var keyHelp = document.getElementById("key-help");
  var tighterBtn = document.getElementById("tighter");
  var looserBtn = document.getElementById("looser");
  var resetBtn = document.getElementById("reset");
  var commitBtn = document.getElementById("commit");
  var live = document.getElementById("live");
  var rankEl = document.getElementById("rank");
  var totalEl = document.getElementById("total");
  var totalOf = document.getElementById("total-of");
  var shareEl = document.getElementById("share-line");
  var copyBtn = document.getElementById("copy");
  var shareBtn = document.getElementById("share");
  var bestLine = document.getElementById("best-line");
  var againBtn = document.getElementById("again");
  var sheetCount = document.getElementById("sheetCount");
  var sheetNote = document.getElementById("sheet-note");
  var emptyEl = document.getElementById("sheetEmpty");
  var tape = document.getElementById("tape");
  var themeBtn = document.getElementById("themeToggle");
  var themeMeta = document.getElementById("themeColor");

  var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);

  var prepared = [];
  var roundIndex = 0;
  var phase = "loading";
  var playerKerns = [];
  var results = [];
  var ready = false;
  var selected = 1;
  var fontSize = 72;
  var offsetPx = 0;
  var freezeOffset = false;
  var letterEls = [];
  var ghostEls = [];
  var drag = null;
  var best = readBest();
  var copyTimer = 0;
  var sessionSeed = freshSeed();

  function freshSeed() {
    return (Date.now() ^ ((Math.random() * 0x100000000) >>> 0)) >>> 0;
  }

  function hashString(value) {
    var h = 2166136261;
    for (var i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function cssFamily(name) {
    return '"' + name.replace(/"/g, "") + '"';
  }

  function current() {
    return prepared[roundIndex];
  }

  function readBest() {
    try {
      var raw = localStorage.getItem("niaz-kern-best");
      if (raw == null || raw === "") return null;
      var n = Number(raw);
      if (!isFinite(n) || n < 0) return null;
      return Math.round(n);
    } catch (e) {
      return null;
    }
  }

  function writeBest(n) {
    try { localStorage.setItem("niaz-kern-best", String(n)); } catch (e) {}
  }

  function speak(text) {
    if (!text) return;
    live.textContent = "";
    live.textContent = text;
  }

  function syncThemeButton() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.textContent = dark ? "Light" : "Dark";
    themeBtn.setAttribute("aria-pressed", dark ? "true" : "false");
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    if (themeMeta) themeMeta.setAttribute("content", dark ? "#14110E" : "#F3EDE2");
  }

  function measureGlyph(ch, family, weight) {
    var canvas = document.createElement("canvas");
    var width = 640;
    var height = 420;
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas");
    ctx.font = weight + " " + REF + "px " + cssFamily(family);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#000000";
    var metrics = ctx.measureText(ch);
    var originX = 48;
    var baseline = 280;
    ctx.fillText(ch, originX, baseline);
    var image = ctx.getImageData(0, 0, width, height);
    var data = image.data;
    var left = new Array(height);
    var right = new Array(height);
    for (var y = 0; y < height; y++) {
      var minX = null;
      var maxX = null;
      var row = y * width * 4;
      for (var x = 0; x < width; x++) {
        if (data[row + x * 4 + 3] > INK) {
          if (minX === null) minX = x;
          maxX = x;
        }
      }
      left[y] = minX === null ? null : (minX - originX) / REF;
      right[y] = maxX === null ? null : (maxX - originX) / REF;
    }
    var descent = metrics.fontBoundingBoxDescent;
    if (typeof descent !== "number" || !isFinite(descent)) descent = 0;
    return {
      advance: metrics.width / REF,
      left: left,
      right: right,
      descentEm: descent / REF
    };
  }

  function loadFace(spec) {
    var face = spec.weight + " " + REF + "px " + cssFamily(spec.fontFamily);
    if (!document.fonts || !document.fonts.load) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var timer = window.setTimeout(function () { finish(false); }, 8000);
      document.fonts.load(face).then(function () {
        window.clearTimeout(timer);
        var ok = !document.fonts.check || document.fonts.check(face);
        finish(!!ok);
      }).catch(function () {
        window.clearTimeout(timer);
        finish(false);
      });
    });
  }

  function prepare(seed) {
    return Promise.all(Kern.ROUNDS.map(loadFace)).then(function (loaded) {
      return Kern.ROUNDS.map(function (spec, index) {
        var glyphs = [];
        var missing = !loaded[index];
        for (var c = 0; c < spec.word.length; c++) {
          var glyph = measureGlyph(spec.word.charAt(c), spec.fontFamily, spec.weight);
          if (!(glyph.advance > 0.05)) missing = true;
          glyphs.push(glyph);
        }
        var ideal = Kern.applyNudges(Kern.kernsForGlyphs(glyphs, {
          colorGap: spec.color,
          percentile: spec.percentile,
          band: spec.band
        }), spec.nudges);
        var start = Kern.scrambleKerns(ideal, {
          seed: (seed ^ hashString(spec.word)) >>> 0,
          deadZone: spec.deadZone,
          spread: spec.spread,
          looseBias: spec.looseBias
        }).map(function (kern, i) {
          return Kern.clampKern(kern, ideal[i], spec.spread);
        });
        var descentEm = 0;
        glyphs.forEach(function (glyph) {
          if (glyph.descentEm > descentEm) descentEm = glyph.descentEm;
        });
        return {
          spec: spec,
          advances: glyphs.map(function (glyph) { return glyph.advance; }),
          descentEm: descentEm,
          ideal: ideal,
          start: start,
          fontMissing: missing
        };
      });
    });
  }

  function innerPx() {
    return Math.max(140, stick.clientWidth - 28);
  }

  function widest(round) {
    var limit = Kern.kernLimit(round.spec.spread);
    var loose = round.ideal.map(function (kern) { return kern + limit; });
    var tight = round.ideal.map(function (kern) { return kern - limit; });
    var widths = [
      Kern.layoutBox(round.advances, loose).width,
      Kern.layoutBox(round.advances, tight).width,
      Kern.layoutBox(round.advances, round.ideal).width,
      Kern.layoutBox(round.advances, playerKerns.length ? playerKerns : round.start).width
    ];
    var width = 0;
    widths.forEach(function (value) { if (value > width) width = value; });
    return width + 0.45;
  }

  function unionBox(round) {
    var boxes = [Kern.layoutBox(round.advances, playerKerns)];
    if (phase === "review") boxes.push(Kern.layoutBox(round.advances, round.ideal));
    var minX = boxes[0].minX;
    var maxX = boxes[0].maxX;
    boxes.forEach(function (box) {
      if (box.minX < minX) minX = box.minX;
      if (box.maxX > maxX) maxX = box.maxX;
    });
    return { minX: minX - 0.08, maxX: maxX + 0.12 };
  }

  function layout() {
    if (!ready || phase === "loading" || phase === "final") return;
    var round = current();
    fontSize = Kern.fitFontSize(widest(round), innerPx(), 26, 108);
    stick.style.setProperty("--em", fontSize + "px");
    stick.style.setProperty("--drop", (round.descentEm * fontSize) + "px");
    lettersEl.style.fontSize = fontSize + "px";
    if (!freezeOffset) {
      var box = unionBox(round);
      var widthPx = (box.maxX - box.minX) * fontSize;
      offsetPx = (stick.clientWidth - widthPx) / 2 - box.minX * fontSize;
    }
    var bottom = (-round.descentEm * fontSize) + "px";
    var player = Kern.layoutBox(round.advances, playerKerns);
    letterEls.forEach(function (el, i) {
      el.style.fontSize = fontSize + "px";
      el.style.left = (offsetPx + player.origins[i] * fontSize) + "px";
      el.style.bottom = bottom;
    });
    if (phase === "review") {
      var studio = Kern.layoutBox(round.advances, round.ideal);
      ghostEls.forEach(function (el, i) {
        el.style.fontSize = fontSize + "px";
        el.style.left = (offsetPx + studio.origins[i] * fontSize) + "px";
        el.style.bottom = bottom;
      });
    }
  }

  function updateAria() {
    var round = current();
    if (!round) return;
    for (var i = 1; i < letterEls.length; i++) {
      var now = Math.round(playerKerns[i - 1] * 1000);
      var el = letterEls[i];
      el.setAttribute("aria-valuemin", "-900");
      el.setAttribute("aria-valuemax", "900");
      el.setAttribute("aria-valuenow", String(now));
      el.setAttribute("aria-valuetext", "Letter " + round.spec.word.charAt(i) + ", spacing " + now);
      if (phase === "play") {
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-disabled");
      } else {
        el.setAttribute("tabindex", "-1");
        el.setAttribute("aria-disabled", "true");
      }
    }
  }

  function select(index, focusIt) {
    var round = current();
    if (!round) return;
    if (index < 0) index = 0;
    if (index > round.spec.word.length - 1) index = round.spec.word.length - 1;
    selected = index;
    letterEls.forEach(function (el, i) {
      el.classList.toggle("is-selected", phase === "play" && i === index && i > 0);
    });
    if (focusIt && letterEls[index] && letterEls[index].focus) {
      letterEls[index].focus({ preventScroll: true });
    }
  }

  function buildLetters() {
    var round = current();
    var word = round.spec.word;
    lettersEl.replaceChildren();
    ghostsEl.replaceChildren();
    ghostsEl.hidden = true;
    ghostEls = [];
    letterEls = [];
    var family = cssFamily(round.spec.fontFamily);
    lettersEl.style.fontFamily = family;
    lettersEl.style.fontWeight = String(round.spec.weight);
    lettersEl.setAttribute("aria-label", word + ". Drag the letters to set the spacing.");
    for (var i = 0; i < word.length; i++) {
      var el;
      if (i === 0) {
        el = document.createElement("span");
        el.className = "letter is-anchor";
        el.setAttribute("aria-hidden", "true");
      } else {
        el = document.createElement("button");
        el.type = "button";
        el.className = "letter";
        el.setAttribute("role", "slider");
        el.setAttribute("aria-orientation", "horizontal");
        el.setAttribute("aria-label", "Letter " + word.charAt(i) + ", space after " + word.charAt(i - 1));
        el.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
      }
      el.textContent = word.charAt(i);
      el.style.fontFamily = family;
      el.style.fontWeight = String(round.spec.weight);
      lettersEl.appendChild(el);
      letterEls.push(el);
    }
    if (selected < 1) selected = 1;
    updateAria();
    select(selected, false);
  }

  function buildGhosts() {
    var round = current();
    var word = round.spec.word;
    var family = cssFamily(round.spec.fontFamily);
    ghostsEl.replaceChildren();
    ghostEls = [];
    ghostsEl.hidden = false;
    ghostsEl.style.fontFamily = family;
    ghostsEl.style.fontWeight = String(round.spec.weight);
    ghostsEl.setAttribute("aria-hidden", "true");
    for (var i = 0; i < word.length; i++) {
      var el = document.createElement("span");
      el.className = "ghost";
      el.textContent = word.charAt(i);
      el.style.fontFamily = family;
      el.style.fontWeight = String(round.spec.weight);
      ghostsEl.appendChild(el);
      ghostEls.push(el);
    }
  }

  function renderSheet(grew) {
    var totalRounds = prepared.length || Kern.ROUNDS.length;
    sheetCount.textContent = String(results.length).padStart(2, "0");
    emptyEl.hidden = results.length > 0;
    tape.replaceChildren();
    results.forEach(function (row, index) {
      var li = document.createElement("li");
      if (grew && !reduceMotion && index === results.length - 1) li.className = "is-new";

      var idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = String(index + 1).padStart(2, "0");

      var body = document.createElement("div");
      var word = document.createElement("p");
      word.className = "tape-word";
      word.style.fontFamily = cssFamily(row.fontFamily);
      word.style.fontWeight = String(row.weight);
      word.textContent = row.word;
      var face = document.createElement("p");
      face.className = "tape-face";
      face.textContent = row.fontFamily;
      body.appendChild(word);
      body.appendChild(face);

      var score = document.createElement("p");
      score.className = "tape-score" + (row.score >= 80 ? " is-high" : "");
      score.textContent = String(row.score);
      score.setAttribute("aria-label", "Fit " + row.score + " out of 100");

      li.appendChild(idx);
      li.appendChild(body);
      li.appendChild(score);
      tape.appendChild(li);
    });
    if (grew && tape.lastElementChild && tape.lastElementChild.scrollIntoView) {
      try { tape.lastElementChild.scrollIntoView({ block: "nearest" }); } catch (e) {}
    }
    if (results.length === 0) {
      sheetNote.textContent = best == null
        ? "Finished words stay here, with the fit beside each one."
        : "Best so far " + best + ". Finished words pin here.";
    } else {
      var running = Kern.totalScore(results.map(function (row) { return row.score; }));
      sheetNote.textContent = "Running " + running + " of " + (totalRounds * 100) + ".";
    }
  }

  function renderChrome() {
    var round = current();
    var n = roundIndex + 1;
    var totalRounds = prepared.length;
    specimen.textContent = round.spec.fontFamily;
    roundTitle.textContent = round.spec.word;
    caption.hidden = phase !== "review";
    nudge.hidden = phase !== "play";
    keyHelp.hidden = phase !== "play";
    resetBtn.hidden = phase !== "play";
    stick.classList.toggle("is-locked", phase !== "play");

    if (phase === "play") {
      phaseLabel.textContent = "Round";
      roundCount.textContent = String(n).padStart(2, "0");
      roundCount.setAttribute("aria-label", "Round " + n + " of " + totalRounds);
      noteEl.textContent = "Move the letters until the word holds together.";
      commitBtn.textContent = "Set word";
    } else if (phase === "review") {
      var last = results[results.length - 1];
      phaseLabel.textContent = "Fit";
      roundCount.textContent = String(last.score);
      roundCount.setAttribute("aria-label", "Fit " + last.score + " out of 100");
      noteEl.textContent = last.note;
      commitBtn.textContent = roundIndex >= totalRounds - 1 ? "See the proof" : "Next word";
      if (!reduceMotion) {
        roundCount.classList.remove("is-result");
        void roundCount.offsetWidth;
        roundCount.classList.add("is-result");
      }
    }

    if (round.fontMissing && phase === "play") {
      noteEl.textContent = "This face did not load, so the round is using a fallback.";
    }
    commitBtn.disabled = !ready;
    renderSheet(phase === "review");
  }

  function setKern(kernIndex, dem) {
    var round = current();
    var before = playerKerns[kernIndex];
    playerKerns[kernIndex] = Kern.clampKern(before + dem, round.ideal[kernIndex], round.spec.spread);
    updateAria();
    return playerKerns[kernIndex] - before;
  }

  function nudgeBy(direction, step) {
    if (phase !== "play" || !ready) return;
    if (selected < 1) select(1, false);
    var applied = setKern(selected - 1, direction * step);
    layout();
    var ch = current().spec.word.charAt(selected);
    if (applied === 0) speak("Letter " + ch + ", at the limit.");
    else if (document.activeElement !== letterEls[selected]) {
      speak("Letter " + ch + ", " + (direction < 0 ? "tighter" : "looser") + ".");
    }
  }

  function beginRound(focusLetter) {
    var round = current();
    playerKerns = round.start.slice();
    phase = "play";
    freezeOffset = false;
    selected = 1;
    drag = null;
    stick.classList.remove("is-dragging");
    buildLetters();
    renderChrome();
    layout();
    if (focusLetter) select(1, true);
    speak("Round " + (roundIndex + 1) + " of " + prepared.length + ". " + round.spec.word + ". " + round.spec.fontFamily + ".");
  }

  function commit() {
    if (phase !== "play" || !ready) return;
    var round = current();
    var score = Kern.scoreKerns(playerKerns, round.ideal, round.spec.tolerance);
    var note = Kern.reviewLine(round.spec.word, playerKerns, round.ideal, score);
    results.push({
      word: round.spec.word,
      fontFamily: round.spec.fontFamily,
      weight: round.spec.weight,
      score: score,
      note: note
    });
    phase = "review";
    drag = null;
    freezeOffset = false;
    stick.classList.remove("is-dragging");
    buildGhosts();
    updateAria();
    select(-1, false);
    renderChrome();
    layout();
    speak("Fit " + score + " out of 100. " + note);
    commitBtn.focus();
  }

  function finish() {
    phase = "final";
    drag = null;
    var scores = results.map(function (row) { return row.score; });
    var total = Kern.totalScore(scores);
    var line = Kern.shareLine(total, results.length);
    var previous = best;
    var isNew = previous != null && total > previous;
    if (previous == null || total > previous) {
      best = total;
      writeBest(total);
    }
    playView.hidden = true;
    finalView.hidden = false;
    rankEl.textContent = Kern.rankFor(total, results.length);
    totalEl.textContent = String(total);
    totalOf.textContent = "out of " + (results.length * 100);
    shareEl.textContent = line;
    bestLine.textContent = isNew ? "New best." : "Best " + best + ".";
    if (!reduceMotion) {
      totalEl.classList.remove("is-result");
      void totalEl.offsetWidth;
      totalEl.classList.add("is-result");
    }
    renderSheet(false);
    speak(line + ". " + bestLine.textContent);
    againBtn.focus();
  }

  function advance() {
    if (phase !== "review") return;
    if (roundIndex >= prepared.length - 1) {
      finish();
      return;
    }
    roundIndex += 1;
    beginRound(true);
  }

  function resetWord() {
    if (phase !== "play" || !ready) return;
    playerKerns = current().start.slice();
    freezeOffset = false;
    updateAria();
    layout();
    speak("Word reset.");
  }

  function playAgain() {
    sessionSeed = freshSeed();
    ready = false;
    phase = "loading";
    results = [];
    roundIndex = 0;
    playerKerns = [];
    finalView.hidden = true;
    playView.hidden = false;
    commitBtn.disabled = true;
    noteEl.textContent = "Setting the type.";
    roundTitle.textContent = "Setting the type";
    renderSheet(false);
    boot();
  }

  function nearestLetter(clientX) {
    var bestIndex = 0;
    var bestDist = Infinity;
    letterEls.forEach(function (el, i) {
      var rect = el.getBoundingClientRect();
      var cx = rect.left + Math.max(rect.width, 1) / 2;
      var dist = Math.abs(cx - clientX);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    });
    return { index: bestIndex, dist: bestDist };
  }

  function endDrag(event) {
    if (!drag) return;
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
    drag = null;
    freezeOffset = false;
    stick.classList.remove("is-dragging");
    layout();
  }

  stick.addEventListener("pointerdown", function (event) {
    if (phase !== "play" || !ready) return;
    if (event.button !== undefined && event.button !== 0) return;
    var hit = nearestLetter(event.clientX);
    if (hit.dist > fontSize * 0.75 + 40) return;
    event.preventDefault();
    select(hit.index === 0 ? Math.max(selected, 1) : hit.index, hit.index > 0);
    drag = { pointerId: event.pointerId, index: hit.index, lastX: event.clientX };
    freezeOffset = true;
    stick.classList.add("is-dragging");
    try { stick.setPointerCapture(event.pointerId); } catch (e) {}
  });

  document.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var dx = event.clientX - drag.lastX;
    if (!dx) return;
    drag.lastX = event.clientX;
    var dem = dx / fontSize;
    if (drag.index === 0) {
      var applied = setKern(0, -dem);
      offsetPx += -applied * fontSize;
    } else {
      setKern(drag.index - 1, dem);
    }
    layout();
  });

  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  lettersEl.addEventListener("keydown", function (event) {
    if (phase !== "play" || !ready) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      var next = selected + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 1) next = 1;
      select(next, true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      return;
    }
    var step = event.shiftKey ? 0.04 : 0.008;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeBy(-1, step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeBy(1, step);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (phase !== "play" || !ready) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target;
    if (target && target.classList && target.classList.contains("letter")) return;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (target && target.tagName === "BUTTON" && target !== tighterBtn && target !== looserBtn) return;
    var step = event.shiftKey ? 0.04 : 0.008;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeBy(-1, step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeBy(1, step);
    } else if (event.key === "Enter" && target !== commitBtn) {
      event.preventDefault();
      commit();
    }
  });

  tighterBtn.addEventListener("click", function () { nudgeBy(-1, 0.016); });
  looserBtn.addEventListener("click", function () { nudgeBy(1, 0.016); });
  resetBtn.addEventListener("click", resetWord);
  commitBtn.addEventListener("click", function () {
    if (phase === "play") commit();
    else if (phase === "review") advance();
  });
  againBtn.addEventListener("click", playAgain);

  copyBtn.addEventListener("click", function () {
    var text = shareEl.textContent || "";
    var done = function () {
      copyBtn.textContent = "Copied";
      speak("Copied the result.");
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(function () { copyBtn.textContent = "Copy"; }, 1600);
    };
    function fallback() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (e) {}
      area.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); done(); });
    } else {
      fallback();
      done();
    }
  });

  if (navigator.share) shareBtn.hidden = false;
  shareBtn.addEventListener("click", function () {
    if (!navigator.share) return;
    navigator.share({ title: "Kern", text: shareEl.textContent || "" }).catch(function () {});
  });

  themeBtn.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("niaz-kern-theme", next); } catch (e) {}
    syncThemeButton();
  });

  var resizePending = false;
  window.addEventListener("resize", function () {
    if (resizePending) return;
    resizePending = true;
    window.requestAnimationFrame(function () {
      resizePending = false;
      layout();
    });
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () { layout(); }).observe(stick);
  }

  if (motionQuery && motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function () { reduceMotion = motionQuery.matches; });
  }

  function boot() {
    var started = Date.now();
    prepare(sessionSeed).then(function (rounds) {
      prepared = rounds;
      ready = true;
      beginRound(false);
      return started;
    }).catch(function () {
      noteEl.textContent = "The faces did not set. Reload the page.";
      speak(noteEl.textContent);
    });
  }

  syncThemeButton();
  renderSheet(false);
  boot();
})();
