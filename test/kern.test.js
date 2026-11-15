/* Scoring and optical-fit tests. Run with: node test/kern.test.js */
var assert = require("assert");
var Kern = require("../kern.js");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error("FAIL  " + name);
    console.error("      " + (err && err.stack ? err.stack : err));
  }
}

function flat(value, n) {
  var row = [];
  for (var i = 0; i < n; i++) row.push(value);
  return row;
}

function near(actual, expected, name) {
  assert.ok(Math.abs(actual - expected) < 1e-9, (name || "value") + " " + actual + " ~= " + expected);
}

test("a flat pair is set one colour-gap apart", function () {
  var right = flat(0.85, 20);
  var left = flat(0.12, 20);
  var origin = Kern.placeOrigin(right, left, { colorGap: 0.08, percentile: 0, band: 0.05 });
  near(origin, 0.85 - 0.12 + 0.08);
  var kerns = Kern.kernsForGlyphs([
    { advance: 1, right: right, left: flat(0, 20) },
    { advance: 1, right: flat(1, 20), left: left }
  ], { colorGap: 0.08, percentile: 0, band: 0.05 });
  assert.strictEqual(kerns.length, 1);
  near(kerns[0], origin - 1);
});

test("diagonals nest more than stems with the same advance", function () {
  var rows = 20;
  var stemRight = flat(0.9, rows);
  var stemLeft = flat(0.1, rows);
  var diagRight = [];
  var diagLeft = [];
  for (var y = 0; y < rows; y++) {
    diagRight.push(y === 0 ? 0.42 : 0.2);
    diagLeft.push(y === 0 ? 0.58 : 0.86);
  }
  var opt = { colorGap: 0.08, percentile: 0, band: 0.05 };
  var stem = Kern.kernsForGlyphs([
    { advance: 1, right: stemRight, left: flat(0, rows) },
    { advance: 1, right: flat(1, rows), left: stemLeft }
  ], opt)[0];
  var diag = Kern.kernsForGlyphs([
    { advance: 1, right: diagRight, left: flat(0, rows) },
    { advance: 1, right: flat(1, rows), left: diagLeft }
  ], opt)[0];
  assert.ok(diag < stem, "diagonal kern " + diag + " should be tighter than stem " + stem);
  assert.ok(diag < -0.4, "the tips should overlap in the em box");
});

test("a single spur does not hold the pair open", function () {
  var right = flat(0.5, 10);
  right[3] = 0.95;
  var left = flat(0.1, 10);
  var origin = Kern.placeOrigin(right, left, { colorGap: 0.08, percentile: 0.2, band: 0.1 });
  near(origin, 0.5 - 0.1 + 0.08, "body gap");
  assert.ok(origin < 0.95 - 0.1, "the spur is not the contact");
});

test("profiles that never share a row do not invent a kern", function () {
  var kerns = Kern.kernsForGlyphs([
    { advance: 0.7, right: [1, null, null], left: [0, null, null] },
    { advance: 0.7, right: [null, null, 1], left: [null, null, 0] }
  ], { colorGap: 0.08, percentile: 0, band: 0.5 });
  near(kerns[0], 0);
});

test("nudges are added in em and missing entries stay put", function () {
  var shifted = Kern.applyNudges([-0.04, 0.02, 0.1], [0, -0.03]);
  near(shifted[0], -0.04);
  near(shifted[1], -0.01);
  near(shifted[2], 0.1);
});

test("score is 100 on the studio setting and 0 at the tolerance", function () {
  var ideal = [0.02, -0.08, 0.04];
  assert.strictEqual(Kern.scoreKerns(ideal.slice(), ideal, 0.1), 100);
  assert.strictEqual(Kern.scoreKerns([0.07, -0.03, 0.09], ideal, 0.1), 50);
  assert.strictEqual(Kern.scoreKerns([0.12, 0.02, 0.14], ideal, 0.1), 0);
  assert.strictEqual(Kern.scoreKerns([0.4, 0.4, 0.4], ideal, 0.1), 0);
  assert.strictEqual(Kern.scoreKerns([], [], 0.1), 100);
});

test("score rejects a mismatched pair list", function () {
  assert.throws(function () { Kern.scoreKerns([0], [0, 1], 0.1); }, /mismatch/);
  assert.throws(function () { Kern.scoreKerns([0], [0], 0); }, /tolerance/);
  assert.throws(function () { Kern.scoreKerns([NaN], [0], 0.1); }, /finite/);
});

test("the worst pair is the one furthest from the studio", function () {
  assert.strictEqual(Kern.worstPair([0, 0.2, -0.05], [0, 0, 0]), 1);
  assert.strictEqual(Kern.worstPair([0.2, -0.2], [0, 0]), 0);
  assert.strictEqual(
    Kern.reviewLine("VAN", [0.05, 0], [0, 0], 80),
    "The V and A are still too open."
  );
  assert.strictEqual(
    Kern.reviewLine("VAN", [-0.05, 0], [0, 0], 80),
    "The V and A are sitting too close."
  );
  assert.strictEqual(
    Kern.reviewLine("VAN", [0, -0.05], [0, 0], 80),
    "The A and N are sitting too close."
  );
  assert.strictEqual(
    Kern.reviewLine("VAN", [0.004, 0], [0, 0], 90),
    "Set. The rhythm matches the studio."
  );
  assert.strictEqual(
    Kern.reviewLine("WAVE", [0.2, 0, 0], [0, 0, 0], 97),
    "Set. The rhythm matches the studio."
  );
});

test("ranks break on the printed averages", function () {
  assert.strictEqual(Kern.rankFor(920, 10), "Master proof");
  assert.strictEqual(Kern.rankFor(919, 10), "Compositor");
  assert.strictEqual(Kern.rankFor(800, 10), "Compositor");
  assert.strictEqual(Kern.rankFor(799, 10), "Steady hand");
  assert.strictEqual(Kern.rankFor(650, 10), "Steady hand");
  assert.strictEqual(Kern.rankFor(649, 10), "Loose fit");
  assert.strictEqual(Kern.rankFor(450, 10), "Loose fit");
  assert.strictEqual(Kern.rankFor(449, 10), "Open case");
  assert.strictEqual(Kern.rankFor(0, 10), "Open case");
  assert.strictEqual(Kern.shareLine(864, 10), "Kern 864/1000 · Compositor");
  assert.strictEqual(Kern.totalScore([100, 80, 20]), 200);
});

test("a scramble is repeatable and stays visibly off the studio", function () {
  var ideal = [0, -0.05, 0.02];
  var options = { seed: 11, deadZone: 0.08, spread: 0.3, looseBias: 1 };
  var once = Kern.scrambleKerns(ideal, options);
  var twice = Kern.scrambleKerns(ideal, options);
  assert.deepStrictEqual(once, twice);
  once.forEach(function (kern, i) {
    var delta = kern - ideal[i];
    assert.ok(delta >= 0.08 && delta <= 0.3, "loose delta " + delta);
  });
  var tight = Kern.scrambleKerns(ideal, { seed: 11, deadZone: 0.08, spread: 0.3, looseBias: 0 });
  tight.forEach(function (kern, i) {
    var delta = kern - ideal[i];
    assert.ok(delta <= -0.08 && delta >= -0.3, "tight delta " + delta);
  });
  assert.notDeepStrictEqual(
    Kern.scrambleKerns(ideal, { seed: 12, deadZone: 0.08, spread: 0.3, looseBias: 0.5 }),
    Kern.scrambleKerns(ideal, { seed: 13, deadZone: 0.08, spread: 0.3, looseBias: 0.5 })
  );
});

test("clamped kerns can still reach the studio setting", function () {
  near(Kern.clampKern(0.5, 0, 0.2), 0.24);
  near(Kern.clampKern(-0.5, 0, 0.2), -0.24);
  near(Kern.clampKern(0.02, 0, 0.2), 0.02);
  var ideal = -0.08;
  var scrambled = Kern.scrambleKerns([ideal], { seed: 4, deadZone: 0.1, spread: 0.3, looseBias: 0.5 })[0];
  var clamped = Kern.clampKern(scrambled, ideal, 0.3);
  near(clamped, scrambled);
  assert.ok(Math.abs(clamped - ideal) <= Kern.kernLimit(0.3));
});

test("layout follows the pen, including a negative kern", function () {
  var box = Kern.layoutBox([0.8, 0.6, 0.7], [-0.9, 0.1]);
  near(box.origins[0], 0);
  near(box.origins[1], -0.1);
  near(box.origins[2], 0.6);
  near(box.minX, -0.1);
  near(box.width, 0.7 + 0.6 - (-0.1));
  assert.throws(function () { Kern.layoutBox([1, 1], [0, 0]); }, /mismatch/);
});

test("display size fits the stick and stays inside the caps", function () {
  assert.strictEqual(Kern.fitFontSize(10, 640, 26, 104), 64);
  assert.strictEqual(Kern.fitFontSize(4, 800, 26, 104), 104);
  assert.strictEqual(Kern.fitFontSize(20, 300, 26, 104), 26);
  assert.throws(function () { Kern.fitFontSize(0, 100, 26, 104); }, /widths/);
});

test("the ten rounds get stricter and do not repeat a word", function () {
  assert.strictEqual(Kern.ROUNDS.length, 10);
  var seen = {};
  var previous = Infinity;
  Kern.ROUNDS.forEach(function (round) {
    assert.strictEqual(seen[round.word], undefined, round.word);
    seen[round.word] = true;
    assert.ok(round.word.length >= 3, round.word);
    assert.strictEqual(round.word, round.word.toUpperCase());
    assert.ok(round.tolerance <= previous, round.word + " tolerance");
    previous = round.tolerance;
    assert.ok(round.spread > round.deadZone);
    assert.ok(round.color > 0);
    assert.ok(round.fontFamily.length > 1);
  });
  assert.strictEqual(Kern.ROUNDS[0].word, "VAN");
  assert.strictEqual(Kern.ROUNDS[9].word, "VANCOUVER");
  assert.strictEqual(Kern.ROUNDS[9].fontFamily, "Gloock");
});

if (failed) {
  console.error(failed + " failed, " + passed + " passed");
  process.exit(1);
}
console.log(passed + " tests passed");
