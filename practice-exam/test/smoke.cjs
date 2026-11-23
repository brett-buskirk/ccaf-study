// Smoke test for ccaf-practice.html: loads the page in jsdom and drives the main flows (answering,
// tabs, About, theme switching, erase). jsdom runs the scripts but does no layout or painting, so
// this checks behavior, not appearance. Run with `npm test` from practice-exam/.
const path = require("path");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(path.join(__dirname, "..", "ccaf-practice.html"), "utf8");
const errors = [];
let fail = 0;
const check = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fail++; };

function boot(prefersDark, storage) {
  const vc = new (require("jsdom").VirtualConsole)();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/q.html", virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = (q) => ({ matches: q.includes("dark") ? prefersDark : false, addEventListener() {} });
      w.scrollTo = () => {};
      if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  return dom.window;
}

// Fresh visit, light system
let w = boot(false);
let d = w.document, $ = (id) => d.getElementById(id);
check(!!d.querySelector("#practice .q"), "practice renders a question");
check(d.querySelectorAll("#practice .opt").length === 4, "four options");
check($("ticker").textContent.includes("New here?"), "first-visit ticker link shown");
check($("theme").textContent === "Theme: Auto", "theme starts Auto");
$("ticker").querySelector("button").click();
check(!$("about").hidden && $("practice").hidden, "ticker link opens About");
const about = $("about").textContent;
check(about.includes("150 multiple-choice questions") && about.includes("30 task statements"), "About counts from bank");
check(about.includes("27% of the exam, 40 questions"), "About domain line correct");
check(d.querySelector('nav button[data-view="about"]').getAttribute("aria-selected") === "true", "About tab selected");
[...$("about").querySelectorAll("button")].find((b) => b.textContent === "Progress").click();
check(!$("progress").hidden, "About -> Progress link works");
d.querySelector('nav button[data-view="about"]').click();
[...$("about").querySelectorAll("button")].find((b) => b.textContent === "Start practicing").click();
check(!$("practice").hidden, "Start practicing returns to practice");

// answer + keyboard
d.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "1", bubbles: true }));
check(!!$("next"), "keyboard answer shows Next");
check(JSON.parse(w.localStorage.getItem("ccaf-practice-v1")).log.length === 1, "answer saved");
check(!$("ticker").textContent.includes("New here?"), "first-visit link gone after answering");

// theme cycle on light system: Auto -> Dark -> Light -> Auto
$("theme").click();
check(d.documentElement.dataset.theme === "dark" && w.localStorage.getItem("ccaf-practice-theme") === "dark", "light system: first click -> Dark, saved");
$("theme").click();
check(d.documentElement.dataset.theme === "light", "second click -> Light");
$("theme").click();
check(!d.documentElement.dataset.theme && w.localStorage.getItem("ccaf-practice-theme") === null, "third click -> Auto, cleared");

// Erase progress must not touch theme
$("theme").click();
d.querySelector('nav button[data-view="data"]').click();
const er = [...$("data").querySelectorAll("button")].find((b) => b.textContent.startsWith("Erase"));
er.click(); er.click();
check(w.localStorage.getItem("ccaf-practice-theme") === "dark", "erasing progress keeps theme");

// Dark system: first click goes Light
w = boot(true); d = w.document;
d.getElementById("theme").click();
check(d.documentElement.dataset.theme === "light", "dark system: first click -> Light");

// Saved theme applied at load (head script)
w = boot(false, { "ccaf-practice-theme": "dark" }); d = w.document;
check(d.documentElement.dataset.theme === "dark" && d.getElementById("theme").textContent === "Theme: Dark", "saved Dark applied on load");

// Progress view still renders after some answers
for (let i = 0; i < 8; i++) { d.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "a", bubbles: true })); d.getElementById("next").click(); }
d.querySelector('nav button[data-view="progress"]').click();
check(d.querySelectorAll("#progress .bar").length >= 35, "progress renders bars");

check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join(" | ") : ""));
process.exit(fail ? 1 : 0);
