/* DealerFocus bridge: per-user progress + quiz hooks (loads after auth.js) */
(function () {
  var MAP = [
    { match: /module-01-usa-interactive/i, module: "m1", quiz: "quiz_m1_usa" },
    { match: /module-01-usa\.html/i, module: "m1", quiz: "quiz_m1_usa" },
    { match: /module-02-vehicle101-interactive/i, module: "m2", quiz: "quiz_m2_vehicle" },
    { match: /module-02-vehicle101\.html/i, module: "m2", quiz: "quiz_m2_vehicle" },
    { match: /module-03-software/i, module: "m3", quiz: "quiz_m3_tools" },
    { match: /module-04-csr/i, module: "m4", quiz: "quiz_m4_csr" },
    { match: /csr_fundamentals/i, module: "m4", quiz: "quiz_m4_csr" },
    { match: /module-05-certification/i, module: "m5", quiz: "quiz_final" },
    { match: /module-06-refresher/i, module: "m6", quiz: "quiz_m6_refresh" }
  ];
  function detect() {
    var f = (location.pathname.split("/").pop() || "index.html");
    for (var i = 0; i < MAP.length; i++) if (MAP[i].match.test(f)) return MAP[i];
    return null;
  }
  function hookGradeQuiz(ctx) {
    // Module 01: wrap gradeQuiz() to log per-user attempt
    try {
      if (typeof window.gradeQuiz === "function" && !window.gradeQuiz.__df) {
        var orig = window.gradeQuiz;
        window.gradeQuiz = function () {
          var r = orig.apply(this, arguments);
          try {
            var qs = document.querySelectorAll('#quiz input[type=radio]:checked');
            // recompute score from page questions array if present
            var score = null, total = null;
            if (typeof questions !== "undefined" && questions.length) {
              total = questions.length; score = 0;
              questions.forEach(function (q, i) {
                var sel = document.querySelector('input[name="q' + i + '"]:checked');
                if (sel && Number(sel.value) === q[2]) score++;
              });
              if (window.DFAuth && window.DFAuth.current()) {
                window.DFAuth.logQuiz(ctx.quiz, score, total, { page: location.pathname });
                var pct = Math.round(score / total * 100);
                if (pct >= window.DFAuth.getSettings().passPct) window.DFAuth.markModule(ctx.module, true);
              }
            }
          } catch (e) {}
          return r;
        };
        window.gradeQuiz.__df = true;
      }
    } catch (e) {}
  }
  function hookCert() {
    // Module 05: mirror legacy dfCert_v1 saves into per-user store
    try {
      if (typeof window.submitQuiz === "function" && !window.submitQuiz.__df) {
        var orig = window.submitQuiz;
        window.submitQuiz = function (kind) {
          var r = orig.apply(this, arguments);
          try {
            if (window.DFAuth && window.DFAuth.current()) {
              var raw = localStorage.getItem("dfCert_v1");
              // legacy save already ran; read score from rendered display
              setTimeout(function () {
                try {
                  var el = document.getElementById("writtenScoreDisplay");
                  var m = el ? el.textContent.match(/(\d+)%/) : null;
                  if (m) {
                    window.DFAuth.logQuiz("quiz_final", Number(m[1]), 100, { page: "certification" });
                    // mirror module checkboxes
                    ["m1","m2","m3","m4"].forEach(function (mid) {
                      var row = document.querySelector('[data-toggle="' + mid + '"]');
                      // state unknown here; rely on periodic sync below
                    });
                  }
                  syncCertModules();
                } catch (e) {}
              }, 300);
            }
          } catch (e) {}
          return r;
        };
        window.submitQuiz.__df = true;
      }
    } catch (e) {}
    // periodic sync: if legacy checkboxes toggled, reflect to per-user
    try {
      setInterval(syncCertModules, 2000);
    } catch (e) {}
  }
  function syncCertModules() {
    try {
      if (!window.DFAuth || !window.DFAuth.current()) return;
      if (!/module-05-certification/i.test(location.pathname)) return;
      // heuristic: count .cert-check.done in DOM order -> m1..m4
      var checks = document.querySelectorAll("#moduleList .cert-check");
      var ids = ["m1", "m2", "m3", "m4"];
      checks.forEach(function (c, i) {
        if (ids[i]) window.DFAuth.markModule(ids[i], c.classList.contains("done"));
      });
    } catch (e) {}
  }
  function widget(ctx) {
    try {
      if (!window.DFAuth || !window.DFAuth.current()) return;
      if (document.getElementById("dfTrack")) return;
      var me = window.DFAuth.current();
      var div = document.createElement("div");
      div.id = "dfTrack";
      div.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;background:#050141;color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 12px 34px rgba(0,0,0,.3);font-family:Arial,sans-serif;max-width:300px";
      var p = window.DFAuth.getProgress();
      var done = p.modules && p.modules[ctx.module];
      var q = p.quizzes && p.quizzes[ctx.quiz];
      div.innerHTML =
        '<div style="font-size:12px;font-weight:800;opacity:.8">LOGGED IN AS ' + window.DFAuth.esc(me.name.toUpperCase()) + ' (' + me.role + ')</div>' +
        '<div style="font-weight:800;margin:4px 0">' + (done ? '✓ Module done' : 'Track this module') + (q ? ' • Best: ' + q.score + '%' : '') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
        '<button id="dfDone" style="border:0;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;background:#19c7ff;color:#04222e">' + (done ? 'Mark not done' : 'Mark done') + '</button>' +
        '<button id="dfScore" style="border:0;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;background:#fff;color:#050141">Log score</button>' +
        '<a href="' + (me.role === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html') + '" style="border-radius:8px;padding:8px 12px;font-weight:800;background:transparent;color:#fff;border:1px solid #fff;text-decoration:none;font-size:13px">Dashboard</a>' +
        '</div>';
      document.body.appendChild(div);
      document.getElementById("dfDone").onclick = function () {
        window.DFAuth.markModule(ctx.module, !done);
        location.reload();
      };
      document.getElementById("dfScore").onclick = function () {
        var v = prompt("Enter your quiz score 0-100 for " + ctx.quiz + ":");
        if (v === null) return;
        v = Number(v);
        if (!(v >= 0 && v <= 100)) { alert("Enter 0-100"); return; }
        var total = 100;
        // module 01 has 10 questions; allow raw count auto-detect
        window.DFAuth.logQuiz(ctx.quiz, v, total, { page: location.pathname, manual: true });
        if (v >= window.DFAuth.getSettings().passPct) window.DFAuth.markModule(ctx.module, true);
        location.reload();
      };
    } catch (e) {}
  }
  document.addEventListener("df:ready", function () {
    var ctx = detect();
    if (!ctx) return;
    hookGradeQuiz(ctx);
    if (/module-05-certification/i.test(location.pathname)) hookCert();
    widget(ctx);
  });
})();
