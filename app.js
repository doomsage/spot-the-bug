import flagsmith from "./flagsmith.mjs";

// ---- config -------------------------------------------------------------
const ENV_KEY = "MPr3b43rSokytzETikETse"; // public client-side Flagsmith environment key
const FLAG = "wrong_answer_feedback";
const ARMS = ["explain_now", "hint_then_retry"];
const params = new URLSearchParams(location.search);
// test mode: nothing is sent to Flagsmith events, so test runs never pollute the experiment
const FORCED = ARMS.includes(params.get("arm")) ? params.get("arm") : null;
const TEST = params.get("test") === "1" || !!FORCED || ["localhost", "127.0.0.1"].includes(location.hostname);

// ---- identity -----------------------------------------------------------
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
let ID = localStorage.getItem("stb_id");
if (!ID) { ID = uuid(); localStorage.setItem("stb_id", ID); }
const sent = JSON.parse(localStorage.getItem("stb_sent") || "{}"); // once-per-identity events
const saveSent = () => localStorage.setItem("stb_sent", JSON.stringify(sent));

// ---- event log (shown in the drawer) -------------------------------------
const log = [];
const t0 = Date.now();
function note(name, detail) { log.push({ t: ((Date.now() - t0) / 1000).toFixed(1) + "s", name, detail: detail || "" }); renderDrawer(); }

let arm = "explain_now";
let degraded = false;
let flagInfo = "";

function exposeOnce() {
  if (sent.exposure) return;
  sent.exposure = true; saveSent();
  if (TEST) return note("$flag_exposure", "skipped (test mode)");
  try { flagsmith.trackExposureEvent(FLAG, { value: arm }); note("$flag_exposure", FLAG + " = " + arm); }
  catch (e) { note("exposure failed", String(e)); }
}
function eventOnce(name) {
  if (sent[name]) return;
  sent[name] = true; saveSent();
  if (TEST) return note(name, "skipped (test mode)");
  if (degraded) return note(name, "skipped (flag not loaded)");
  if (!sent.exposure) return note(name, "skipped (not exposed)");
  try { flagsmith.trackEvent(name, { value: 1 }); note(name, "sent"); }
  catch (e) { note(name + " failed", String(e)); }
}

// ---- init ----------------------------------------------------------------
const app = document.getElementById("app");
let Q = [];
async function boot() {
  app.innerHTML = '<p style="margin-top:40vh;text-align:center">Loading...</p>';
  Q = await (await fetch("questions.json")).json();
  try {
    await Promise.race([
      flagsmith.init({ environmentID: ENV_KEY, identity: ID, enableAnalytics: false, enableEvents: true, cacheFlags: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    const on = flagsmith.hasFeature(FLAG);
    const v = flagsmith.getValue(FLAG);
    if (on && ARMS.includes(v)) { arm = v; flagInfo = "served by Flagsmith"; }
    else { degraded = true; flagInfo = "flag off or unreadable, control shown"; }
  } catch (e) { degraded = true; flagInfo = "Flagsmith unreachable, control shown"; }
  if (FORCED) { arm = FORCED; flagInfo = "forced by ?arm= (test mode)"; }
  note("flag", FLAG + " = " + arm + " (" + flagInfo + ")");
  document.getElementById("peek").hidden = false;
  intro();
}

// ---- views -----------------------------------------------------------------
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
let S; // session state
function reset() { S = { i: 0, results: [], mistakePair: {} }; }

function intro() {
  reset();
  app.innerHTML = `
    <div class="eyebrow">Spot the Bug</div>
    <h1>8 JavaScript traps.<br>Predict the output.</h1>
    <p>Each snippet looks innocent. Pick what it really prints. About 3 minutes.</p>
    <p class="fine">Heads up: a real A/B test runs underneath. When you get one wrong, different people see different feedback. Tap "under the hood" any time to see exactly what is recorded.</p>
    <div class="sp"></div>
    <button class="btn" id="go">Start</button>`;
  document.getElementById("go").onclick = () => question();
}

function dots() {
  return '<div class="dots">' + Q.map((_, k) => `<i class="${k < S.i ? "done" : k === S.i ? "cur" : ""}"></i>`).join("") + "</div>";
}

function question() {
  const q = Q[S.i];
  const st = { attempts: 0, firstCorrect: null, picked: [] };
  const [stmt, ...code] = q.question.split("\n");
  app.innerHTML = `
    ${dots()}
    <div class="q">${S.i + 1} of ${Q.length}. ${esc(stmt)}</div>
    <pre>${esc(code.join("\n"))}</pre>
    <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>
    <div id="fb"></div>`;
  app.querySelectorAll(".opt").forEach((b) => (b.onclick = () => pick(q, st, +b.dataset.k)));
}

function lockAll(q) {
  app.querySelectorAll(".opt").forEach((b) => {
    b.disabled = true;
    if (+b.dataset.k === q.answer_index) b.classList.add("ok");
  });
}

function nextBtn(label) {
  return `<button class="btn" id="next">${label}</button>`;
}

function pick(q, st, k) {
  st.attempts++; st.picked.push(k);
  const btn = app.querySelector(`.opt[data-k="${k}"]`);
  const fb = document.getElementById("fb");
  const right = k === q.answer_index;
  if (st.attempts === 1) st.firstCorrect = right;
  if (right) {
    lockAll(q);
    const retry = st.attempts > 1;
    fb.innerHTML = `<div class="box good"><b>${retry ? "Got it" : "Correct"}</b><p>${esc(q.solution)}</p></div>${nextBtn(S.i === Q.length - 1 ? "See results" : "Next")}`;
    return finish(q, st);
  }
  btn.classList.add("bad"); btn.disabled = true;
  if (st.attempts === 1 && q.role === "first") { S.mistakePair[q.pair] = true; exposeOnce(); }
  if (arm === "hint_then_retry" && st.attempts === 1) {
    fb.innerHTML = `<div class="box hint"><b>Not quite. Hint</b><p>${esc(q.hint)}</p></div><p class="fine">Try once more.</p>`;
    return;
  }
  lockAll(q);
  fb.innerHTML = `<div class="box sol"><b>Not quite</b><p>${esc(q.solution)}</p></div>${nextBtn(S.i === Q.length - 1 ? "See results" : "Next")}`;
  finish(q, st);
}

function finish(q, st) {
  S.results[S.i] = { firstCorrect: st.firstCorrect };
  // primary metric: the follow-up of a pair whose first question was missed is answered right on the first try
  if (q.role === "follow_up" && S.mistakePair[q.pair] && st.firstCorrect) eventOnce("paired_followup_correct");
  const nextEl = document.getElementById("next");
  nextEl.onclick = () => {
    nextEl.onclick = null; // ignore double taps
    // guardrail: the player carries on after a mistake instead of quitting
    if (q.role === "first" && S.mistakePair[q.pair]) eventOnce("post_mistake_next_attempt");
    S.i++;
    S.i >= Q.length ? results() : question();
  };
}

function results() {
  const score = S.results.filter((r) => r.firstCorrect).length;
  const pairs = {};
  Q.forEach((q, k) => { (pairs[q.pair] = pairs[q.pair] || {})[q.role] = S.results[k].firstCorrect; });
  const names = { A_sort: "Array sort", B_var_closure: "var in loops", C_null_undefined: "null and undefined", D_parseInt_map: "map + parseInt" };
  const mark = (v) => (v ? "right" : "wrong");
  app.innerHTML = `
    <div class="dots">${Q.map(() => '<i class="done"></i>').join("")}</div>
    <div class="eyebrow">Done</div>
    <div class="score">${score}/8</div>
    <p>correct on the first try</p>
    <div class="pairs">${Object.entries(pairs).map(([p, v]) => `<div class="pair"><span>${names[p] || p}</span><span>${mark(v.first)} then ${mark(v.follow_up)}</span></div>`).join("")}</div>
    <p class="fine">You saw the <b>${arm}</b> feedback version.${TEST ? " Test mode: nothing was recorded." : ""} Your anonymous random id is only used to keep your group stable.</p>
    <div class="sp"></div>
    <button class="btn" id="again">Play again</button>`;
  document.getElementById("again").onclick = intro;
}

// ---- drawer ------------------------------------------------------------------
const drawer = document.getElementById("drawer");
document.getElementById("peek").onclick = () => { drawer.hidden = false; renderDrawer(); };
document.getElementById("drawer-close").onclick = () => (drawer.hidden = true);
function renderDrawer() {
  if (drawer.hidden) return;
  document.getElementById("drawer-body").innerHTML = `
    <div class="kv">hypothesis: <b>after a wrong answer, a hint plus one retry beats showing the answer, on the next related question</b></div>
    <div class="kv">flag: <b>${FLAG}</b> (multivariate, 50/50)</div>
    <div class="kv">your version: <b>${arm}</b></div>
    <div class="kv">identity: <b>${ID}</b></div>
    <div class="kv">mode: <b>${TEST ? "test (no events sent)" : degraded ? "degraded (control, no events)" : "live experiment"}</b></div>
    <h3>Event log (this session)</h3>
    <table>${log.map((r) => `<tr><td>${r.t}</td><td>${esc(r.name)}<br><span style="color:#8b94ab">${esc(r.detail)}</span></td></tr>`).join("")}</table>
    <h3>Rules</h3>
    <div class="kv">exposure fires once, at your first wrong answer on Q1, Q3, Q5 or Q7</div>
    <div class="kv">paired_followup_correct: you missed a first question, then get its twin right first try (primary metric)</div>
    <div class="kv">post_mistake_next_attempt: you keep going after a mistake (guardrail)</div>`;
}

boot();
