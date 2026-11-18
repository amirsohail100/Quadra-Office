// Formula engine checks for the Formulas tab: names, lookup, date, financial and reference helpers.
// Run:  node tests/engine-functions.js   (expected last line: pass=N fail=0)
const path = require("path");
const QE = require(path.join(__dirname, "..", "engine.js"));

const grid = { "0,0": "Pear", "0,1": "2", "1,0": "Plum", "1,1": "4", "2,0": "Fig", "2,1": "6", "0,2": "5" };
const names = { TAX: { r1: 0, c1: 2, r2: 0, c2: 2 }, PRICES: { r1: 0, c1: 1, r2: 2, c2: 1 } };
const cell = (r, c) => QE.parseLiteral(grid[r + "," + c]);
const env = { cell, maxRows: 1048576, maxCols: 16384, name: (n) => names[n.toUpperCase()] || null };
const ev = (f) => { const v = QE.evaluateFormula(f, env); return v instanceof QE.CellError ? v.code : v; };

const checks = [
  ['VLOOKUP("Plum",A1:B3,2,FALSE)', 4], ['VLOOKUP("Kiwi",A1:B3,2,FALSE)', "#N/A"], ['VLOOKUP("Plum",A1:B3,3,FALSE)', "#REF!"],
  ["VLOOKUP(2,A1:B3,1)", "#N/A"], ["INDEX(A1:B3,2,2)", 4], ["INDEX(A1:A3,3)", "Fig"],
  ["INDEX(A1:C1,1,2)", 2], ['MATCH("Fig",A1:A3,0)', 3], ['MATCH("Zed",A1:A3,0)', "#N/A"],
  ["SUM(PRICES)", 12], ["SUM(TAX)", 5], ["UNKNOWN+1", "#NAME?"],
  ["DATE(2024,1,15)", 45306], ["YEAR(DATE(2024,3,1))", 2024], ["MONTH(DATE(2024,3,1))", 3], ["DAY(DATE(2024,3,1))", 1],
  ["ROUND(PMT(0.1/12,12,1000),2)", -87.92], ["ROUND(PMT(0,10,1000),2)", -100], ["TODAY()>45000", true]
];
let pass = 0, fail = 0;
for (const [f, want] of checks) {
  const got = ev(f);
  const ok = got === want || (typeof want === "number" && typeof got === "number" && Math.abs(got - want) < 1e-6);
  if (ok) pass++;
  else { fail++; console.log("FAIL", f, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
}
const refs = QE.referencesOf("=SUM(A1:A3)+B2*C$5");
if (refs.length === 3 && refs[0].r2 === 2) pass++; else { fail++; console.log("FAIL referencesOf"); }
const sub = QE.substituteRefs("=A1*2+SUM(B1:B2)", (r, c) => (r === 0 && c === 0 ? 5 : r === 0 && c === 1 ? "x" : 3));
if (sub === '5*2+SUM({"x",3})') pass++; else { fail++; console.log("FAIL substituteRefs", sub); }
console.log(`pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
