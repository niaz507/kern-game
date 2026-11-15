/* Kern — optical spacing and scoring.
   No DOM. The page and the node tests both use this file.

   The studio setting is not even gaps. For each pair, the right-hand
   edge of the first glyph and the left-hand edge of the next are read
   row by row. A short band just inside the closest rows is set a fixed
   distance apart (the colour gap). Diagonals nest, rounds meet at the
   equator, and a single serif spur does not hold the pair open. */

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Kern = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var AGREE = 0.012;

  /* Ten rounds. Tolerances tighten. Early words are obviously loose;
     later words are longer, in fussier faces, and less forgiving.
     colour, percentile and band are the optical fit for that face.
     nudges, when present, are hand corrections in em added to the fit. */
  var ROUNDS = [
    { word: "VAN", fontFamily: "Besley", weight: 700, color: 0.09, percentile: 0.05, band: 0.05, tolerance: 0.3, deadZone: 0.12, spread: 0.4, looseBias: 0.8 },
    { word: "WAVE", fontFamily: "Fraunces", weight: 600, color: 0.086, percentile: 0.07, band: 0.05, tolerance: 0.27, deadZone: 0.11, spread: 0.36, looseBias: 0.7 },
    { word: "TOAST", fontFamily: "Bodoni Moda", weight: 700, color: 0.072, percentile: 0.05, band: 0.045, tolerance: 0.24, deadZone: 0.1, spread: 0.34, looseBias: 0.65 },
    { word: "LYRIC", fontFamily: "Newsreader", weight: 600, color: 0.078, percentile: 0.06, band: 0.05, tolerance: 0.22, deadZone: 0.1, spread: 0.32, looseBias: 0.6 },
    { word: "FOREST", fontFamily: "Unbounded", weight: 700, color: 0.092, percentile: 0.04, band: 0.05, tolerance: 0.2, deadZone: 0.09, spread: 0.3, looseBias: 0.55 },
    { word: "PACIFIC", fontFamily: "Cormorant Garamond", weight: 600, color: 0.074, percentile: 0.08, band: 0.05, tolerance: 0.185, deadZone: 0.09, spread: 0.28, looseBias: 0.5 },
    { word: "AVENUE", fontFamily: "Big Shoulders Display", weight: 700, color: 0.05, percentile: 0.045, band: 0.05, tolerance: 0.17, deadZone: 0.08, spread: 0.26, looseBias: 0.5 },
    { word: "KNIGHT", fontFamily: "Literata", weight: 700, color: 0.08, percentile: 0.07, band: 0.05, tolerance: 0.16, deadZone: 0.08, spread: 0.25, looseBias: 0.5 },
    { word: "YARROW", fontFamily: "Familjen Grotesk", weight: 600, color: 0.09, percentile: 0.04, band: 0.05, tolerance: 0.15, deadZone: 0.08, spread: 0.24, looseBias: 0.5 },
    { word: "VANCOUVER", fontFamily: "Gloock", weight: 400, color: 0.068, percentile: 0.06, band: 0.045, tolerance: 0.14, deadZone: 0.07, spread: 0.22, looseBias: 0.5 }
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* B's pen position relative to A's, in the same unit as the profiles. */
  function placeOrigin(rightA, leftB, options) {
    var colorGap = options.colorGap;
    var percentile = options.percentile == null ? 0.06 : options.percentile;
    var bandFraction = options.band == null ? 0.05 : options.band;
    if (!(colorGap >= 0)) throw new Error("colorGap must be non-negative");
    var n = Math.min(rightA.length, leftB.length);
    var ink = [];
    for (var y = 0; y < n; y++) {
      if (rightA[y] == null || leftB[y] == null) continue;
      ink.push(rightA[y] - leftB[y]);
    }
    if (ink.length === 0) return null;
    ink.sort(function (a, b) { return b - a; });
    var start = Math.min(ink.length - 1, Math.floor(ink.length * percentile));
    var count = Math.max(1, Math.round(ink.length * bandFraction));
    if (start + count > ink.length) count = ink.length - start;
    var sum = 0;
    for (var i = 0; i < count; i++) sum += ink[start + i];
    return (sum / count) + colorGap;
  }

  function kernsForGlyphs(glyphs, options) {
    if (!glyphs || glyphs.length < 2) return [];
    var kerns = [];
    for (var i = 0; i < glyphs.length - 1; i++) {
      var origin = placeOrigin(glyphs[i].right, glyphs[i + 1].left, options);
      kerns.push(origin == null ? 0 : origin - glyphs[i].advance);
    }
    return kerns;
  }

  function applyNudges(kerns, nudges) {
    return kerns.map(function (kern, i) {
      return kern + (nudges && nudges[i] ? nudges[i] : 0);
    });
  }

  function kernLimit(spread) {
    return spread + 0.04;
  }

  function clampKern(kern, ideal, spread) {
    var limit = kernLimit(spread);
    var min = ideal - limit;
    var max = ideal + limit;
    if (kern < min) return min;
    if (kern > max) return max;
    return kern;
  }

  function scrambleKerns(ideal, options) {
    var deadZone = options.deadZone;
    var spread = options.spread;
    var looseBias = options.looseBias == null ? 0.5 : options.looseBias;
    if (!(spread > deadZone) || !(deadZone >= 0)) throw new Error("spread must exceed the dead zone");
    if (!(looseBias >= 0) || !(looseBias <= 1)) throw new Error("looseBias must be between 0 and 1");
    var rand = mulberry32(options.seed >>> 0);
    return ideal.map(function (kern) {
      var mag = deadZone + rand() * (spread - deadZone);
      var sign = rand() < looseBias ? 1 : -1;
      return kern + sign * mag;
    });
  }

  function scoreKerns(player, ideal, tolerance) {
    if (!player || !ideal || player.length !== ideal.length) throw new Error("kern length mismatch");
    if (!(tolerance > 0)) throw new Error("tolerance must be positive");
    if (player.length === 0) return 100;
    var sum = 0;
    for (var i = 0; i < player.length; i++) {
      if (!isFinite(player[i]) || !isFinite(ideal[i])) throw new Error("kerns must be finite numbers");
      sum += Math.abs(player[i] - ideal[i]);
    }
    var raw = 100 * (1 - (sum / player.length) / tolerance);
    if (raw <= 0) return 0;
    if (raw >= 100) return 100;
    return Math.round(raw);
  }

  function totalScore(scores) {
    var sum = 0;
    for (var i = 0; i < scores.length; i++) sum += scores[i];
    return sum;
  }

  function rankFor(total, roundCount) {
    if (!(roundCount > 0)) throw new Error("roundCount required");
    var avg = total / roundCount;
    if (avg >= 92) return "Master proof";
    if (avg >= 80) return "Compositor";
    if (avg >= 65) return "Steady hand";
    if (avg >= 45) return "Loose fit";
    return "Open case";
  }

  function shareLine(total, roundCount) {
    return "Kern " + total + "/" + (roundCount * 100) + " · " + rankFor(total, roundCount);
  }

  function worstPair(player, ideal) {
    if (!player || !ideal || player.length !== ideal.length || player.length === 0) {
      throw new Error("kern length mismatch");
    }
    var index = 0;
    var worst = -1;
    for (var i = 0; i < player.length; i++) {
      var err = Math.abs(player[i] - ideal[i]);
      if (err > worst) {
        worst = err;
        index = i;
      }
    }
    return index;
  }

  function reviewLine(word, player, ideal, score) {
    if (player.length !== ideal.length) throw new Error("kern length mismatch");
    if (!word || word.length !== player.length + 1) throw new Error("word length mismatch");
    var i = worstPair(player, ideal);
    if (score >= 96 || Math.abs(player[i] - ideal[i]) <= AGREE) {
      return "Set. The rhythm matches the studio.";
    }
    var left = word.charAt(i);
    var right = word.charAt(i + 1);
    if (player[i] > ideal[i]) return "The " + left + " and " + right + " are still too open.";
    return "The " + left + " and " + right + " are sitting too close.";
  }

  function layoutBox(advances, kerns) {
    if (!advances || advances.length < 1) throw new Error("advances required");
    if (!kerns || kerns.length !== advances.length - 1) throw new Error("kern length mismatch");
    var origins = [0];
    for (var i = 0; i < kerns.length; i++) {
      origins.push(origins[i] + advances[i] + kerns[i]);
    }
    var minX = origins[0];
    var maxX = origins[0] + advances[0];
    for (var j = 0; j < origins.length; j++) {
      if (origins[j] < minX) minX = origins[j];
      var right = origins[j] + advances[j];
      if (right > maxX) maxX = right;
    }
    return { origins: origins, minX: minX, maxX: maxX, width: maxX - minX };
  }

  function fitFontSize(widthEm, innerPx, minPx, maxPx) {
    if (!(widthEm > 0) || !(innerPx > 0)) throw new Error("widths must be positive");
    var size = Math.floor(innerPx / widthEm);
    if (size < minPx) return minPx;
    if (size > maxPx) return maxPx;
    return size;
  }

  return {
    AGREE: AGREE,
    ROUNDS: ROUNDS,
    mulberry32: mulberry32,
    placeOrigin: placeOrigin,
    kernsForGlyphs: kernsForGlyphs,
    applyNudges: applyNudges,
    kernLimit: kernLimit,
    clampKern: clampKern,
    scrambleKerns: scrambleKerns,
    scoreKerns: scoreKerns,
    totalScore: totalScore,
    rankFor: rankFor,
    shareLine: shareLine,
    worstPair: worstPair,
    reviewLine: reviewLine,
    layoutBox: layoutBox,
    fitFontSize: fitFontSize
  };
});
