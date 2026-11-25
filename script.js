(() => {
"use strict";
window.__verticeReady = true;
const D = window.VERTICE_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const page = $("#pageContent"), modal = $("#modalBackdrop"), modalContent = $("#modalContent");

/* ---------- armazenamento local (provisório, até o Supabase) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("vertice08:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("vertice08:" + k, JSON.stringify(v)); } catch (e) {} }
};
let user = store.get("user", null);                              // {name, email}
let stats = store.get("stats", { solved: 0, correct: 0, done: {} });
let saved = store.get("saved", []);                              // respostas da nuvem
let plan = store.get("plan", {});                                // {"2026-11-24":["Matemática"]}
let history = store.get("history", []);
let review = store.get("review", []);
let notes = store.get("notes", []);
let planDone = store.get("planDone", {});
let studyMinutes = store.get("studyMinutes", {});
let simAttempts = store.get("simAttempts", []);
let writingProgress = store.get("writingProgress", {});
let achievements = store.get("achievements", []);
let examDrafts = store.get("examDrafts", {});
let simClock = null;

/* ---------- áreas e cores (GDD: humanas azul, exatas vermelho, biológicas verde, bio/exatas verde-marinho) ---------- */
const AREAS = {
  humanas:    { accent: "#4776a8", soft: "#eaf0f7", deep: "#1c3552", hover: "#315b87" },
  exatas:     { accent: "#bd4b50", soft: "#f8ebec", deep: "#4a2027", hover: "#96383e" },
  biologicas: { accent: "#4f8062", soft: "#eaf2ec", deep: "#183d2c", hover: "#356347" },
  bioexatas:  { accent: "#39847d", soft: "#e8f2f0", deep: "#173d3a", hover: "#28665f" }
};
const areaKey = a => a === "Ciências Biológicas" ? "biologicas" : a === "Ciências Biológicas/Exatas" ? "bioexatas" : a === "Ciências Exatas" ? "exatas" : "humanas";
const SUBJECTS = D.subjects.filter(s => s.id !== "literatura");
const subj = id => D.subjects.find(s => s.id === id) || SUBJECTS[0];

let activeCareer = D.careers.find(c => c.id.startsWith("516-geografia")) || D.careers[0];
let view = "inicio";
const ctx = { subjectId: null, model: null, careerFilter: "Todas", careerSearch: "", planEdit: false, quiz: null };
let tourPending = false, tourClose = null;

const toast = msg => { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(window._toast); window._toast = setTimeout(() => t.classList.remove("show"), 2800); };

/* ---------- navegação ---------- */
const NAV_OF = { inicio: "inicio", carreiras: "carreiras", primeira: "primeira", materia: "primeira", quiz: "primeira", segunda: "segunda", dia1: "segunda", dia2: "segunda", redacao: "redacao", extras: "extras", mapa: "extras", lorenz: "extras", jogo: "extras", formulas: "extras", plano: "plano", nuvem: "", preparacao: "preparacao", revisar: "revisar", simulados: "simulados", radar: "radar", conhecimento: "conhecimento", caderno: "caderno", trilhas: "trilhas" };
function crumb() {
  const s = ctx.subjectId ? subj(ctx.subjectId).name : "";
  const base = { inicio: "Visão geral", carreiras: "Carreiras", primeira: "1ª fase", segunda: "2ª fase", dia1: "2ª fase / 1º dia", dia2: "2ª fase / 2º dia", redacao: "Oficina de redação", extras: "Extras", plano: "Plano de estudos", mapa: "Mapa ao vivo", lorenz: "Curva de Lorenz", jogo: "Jogo rápido", formulas: "Caderno de fórmulas", nuvem: "Minhas respostas", preparacao: "Minha preparação", revisar: "Revisar questões", simulados: "Simulados", radar: "Radar FUVEST", conhecimento: "Mapa de conhecimento", caderno: "Caderno pessoal", trilhas: "Trilhas de habilidades" };
  if (view === "materia") return "1ª fase / " + s;
  if (view === "quiz" && ctx.quiz) return ctx.quiz.origin === "fase1" ? "1ª fase / Questões" : "1ª fase / " + s + " / " + ctx.quiz.title;
  return base[view] || "Visão geral";
}
function setNav() {
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.nav === NAV_OF[view]));
  $("#crumbCurrent").textContent = crumb();
  $$(".tab-item").forEach(b => b.classList.toggle("active", b.dataset.nav === NAV_OF[view]));
}
function go(v, opts = {}) {
  if (v !== 'quiz' && simClock) { clearInterval(simClock); simClock=null; }
  view = v; Object.assign(ctx, opts);
  if (v === "segunda" || v === "dia1") { /* mantém modelo só dentro do 1º dia */ }
  setNav(); render(); window.scrollTo({ top: 0 });
  $("#sidebar").classList.remove("open"); $("#mobileOverlay").classList.remove("show");
}

/* ---------- peças de interface ---------- */
function heading(kicker, title, _d, action = "") { return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1></div>${action}</div>`; }
function stat(label, value, foot, icon) { return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`; }
const SUBJECT_ICON_FILES = {
  portugues: "portugues", matematica: "matematica", fisica: "fisica",
  quimica: "quimica", biologia: "biologia", geografia: "geografia",
  historia: "historia", ingles: "ingles", filosofia: "filosofia",
  sociologia: "sociologia", arte: "arte", "educacao-fisica": "educacao-fisica"
};
function subjectMark(s) {
  const icon = SUBJECT_ICON_FILES[s.id];
  const visual = icon
    ? `<img src="./assets/subjects/${icon}.svg" alt="" aria-hidden="true" loading="lazy">`
    : safe(s.icon || s.short || "•");
  return `<div class="subject-mark ${s.color || ""}">${visual}</div>`;
}
function subjectCard(s) { return `<button class="subject-card" data-subject="${s.id}">${subjectMark(s)}<strong>${s.name}</strong><small>${s.area}</small><div class="card-bottom"><span>Explorar conteúdo</span><span>↗</span></div></button>`; }
function mascotMarkup(extra = "") { return `<div class="mascot ${extra}" aria-label="Vértice, mascote do aplicativo"><div class="mascot-spark">✦</div><div class="mascot-face"><span class="eye"></span><span class="eye"></span><span class="mouth"></span></div><div class="mascot-base"></div></div>`; }
function wideBox(attr, icon, title, desc, go) { return `<button class="wide-box" ${attr}><span class="wb-icon">${icon}</span><span><strong>${title}</strong><small>${desc}</small></span><span class="wb-go">${go}</span></button>`; }
function emptyPage(kicker, title, text) {
  return `${heading(kicker, title)}<section class="panel soon-box"><div class="soon-icon">◌</div><h2>Em breve</h2><p>${text}</p></section>`;
}

/* ---------- VISÃO GERAL ---------- */
function renderHome() {
  const pct = stats.solved ? Math.round(stats.correct / stats.solved * 100) : 0;
  return `<section class="dashboard-hero"><div class="hero-copy"><div class="hero-kicker">PREPARAÇÃO FUVEST</div><h1>Seu caminho começa aqui.</h1><div class="hero-actions"><button class="button button-primary" data-nav="primeira">Ir para a 1ª fase <span>→</span></button><button class="button button-quiet" data-nav="carreiras">Escolher carreira</button></div></div><div class="hero-side"><div class="target-card"><div class="label">SUA CARREIRA</div><h3>${safe(activeCareer.name)}</h3><p>${safe(activeCareer.unit)}</p><div class="target-meta"><span>${safe(activeCareer.subjects.join(" · "))}</span><span>FUVEST</span></div><button class="button button-quiet button-small" data-action="change-course" style="margin-top:14px">Alterar curso</button></div></div></section>
  <div class="panel-head section-spacer"><div><h2 class="section-title">Seu desempenho</h2></div><span class="eyebrow">1ª FASE</span></div>
  <div class="grid stats-3">
    ${stat("Questões resolvidas", stats.solved, stats.solved ? "respondidas até agora" : "Nenhuma questão respondida ainda", "✓")}
    ${stat("Nota de corte · 1ª fase", "—", `Ano passado · ${safe(activeCareer.name)}`, "◎")}
    ${stat("Questões erradas", Math.max(0, stats.solved - stats.correct), stats.solved ? "respostas incorretas" : "Nenhuma resposta incorreta", "×")}
  </div>
  <section class="performance-visual" aria-label="Desempenho em questões">
    <div class="performance-chart-card">
      <div class="performance-chart-copy"><div class="eyebrow">SEU DESEMPENHO</div><h2>Acertos e erros</h2><p>Veja como estão suas respostas até agora.</p></div>
      <div class="performance-chart-layout">
        <div class="performance-donut" role="img" aria-label="${stats.correct} questões acertadas e ${Math.max(0, stats.solved - stats.correct)} erradas" style="--correct:${stats.solved ? (stats.correct / stats.solved * 100) : 0}%;">
          <div class="performance-donut-center"><strong>${stats.solved ? pct + "%" : "0%"}</strong><span>de acertos</span></div>
        </div>
        <div class="performance-legend"><div><i class="legend-correct"></i><span>Acertadas</span><strong>${stats.correct}</strong></div><div><i class="legend-wrong"></i><span>Erradas</span><strong>${Math.max(0, stats.solved - stats.correct)}</strong></div><small>${stats.solved} ${stats.solved === 1 ? "questão respondida" : "questões respondidas"}</small></div>
      </div>
    </div>
    <div class="overview-mascot-stage">${mascotMarkup("overview-mascot")}</div>
  </section>
  <section class="panel smart-panel"><div class="panel-head"><div><div class="eyebrow">CENTRAL DE ACOMPANHAMENTO</div><h2>Minha preparação</h2><p class="muted-copy">Entenda seu desempenho e descubra o próximo passo.</p></div><button class="button button-primary" data-nav="preparacao">Abrir painel →</button></div><div class="smart-shortcuts"><button data-nav="revisar"><b>↻</b><span><strong>Revisar questões</strong><small>${review.length} para revisar</small></span></button><button data-nav="simulados"><b>◷</b><span><strong>Simulados</strong><small>${simAttempts.length} tentativas concluídas</small></span></button><button data-nav="conhecimento"><b>▦</b><span><strong>Mapa de conhecimento</strong><small>Acompanhe os conteúdos</small></span></button><button data-nav="caderno"><b>✎</b><span><strong>Caderno pessoal</strong><small>${notes.length} anotações salvas</small></span></button></div></section>`;
}

/* ---------- CARREIRAS (apenas a escolha de carreira) ---------- */
function renderCareers() {
  const areas = ["Todas", "Ciências Humanas", "Ciências Exatas", "Ciências Biológicas", "Ciências Biológicas/Exatas"];
  const q = ctx.careerSearch.toLowerCase();
  const list = D.careers.filter(c => (ctx.careerFilter === "Todas" || c.area === ctx.careerFilter) && (`${c.name} ${c.unit} ${c.area} ${c.code}`).toLowerCase().includes(q));
  return `${heading("ESCOLHA E ESTRATÉGIA", "Carreiras", "", `<button class="button button-quiet" data-action="career-guide">Como funciona? ↗</button>`)}
  <div class="panel"><div class="panel-head"><div><h2>Encontre sua carreira</h2></div><label class="search-field">⌕ <input id="careerSearch" placeholder="Buscar curso ou unidade..." value="${safe(ctx.careerSearch)}"></label></div>
  <div class="filter-row">${areas.map(a => `<button class="filter-chip ${ctx.careerFilter === a ? "active" : ""}" data-career-filter="${a}">${a}</button>`).join("")}</div>
  <div class="grid career-grid">${list.map(c => `<article class="career-card ${activeCareer.id === c.id ? "selected" : ""}"><div class="career-card-top"><div class="career-symbol" data-area="${areaKey(c.area)}">${safe(c.name.trim().charAt(0).toUpperCase())}</div><span class="career-area">${c.area.toUpperCase()}</span></div><h3>${safe(c.name)}</h3><p>${safe(c.description)}</p><div class="career-tags">${c.subjects.map(s => `<span>${s}</span>`).join("")}</div><div class="career-card-foot"><span>${safe(c.unit)} · ${safe(c.period)}</span><button class="text-link" data-career="${c.id}">${activeCareer.id === c.id ? "Selecionada ✓" : "Selecionar →"}</button></div></article>`).join("") || `<div class="empty-state">Nenhuma carreira encontrada para essa busca.</div>`}</div></div>`;
}

/* ---------- 1ª FASE ---------- */
function renderPrimeira() {
  return `${heading("PROVA DE CONHECIMENTOS GERAIS", "1ª fase")}
  <div class="panel-head"><div><h2 class="section-title">Todas as disciplinas</h2></div><span class="eyebrow">${SUBJECTS.length} DISCIPLINAS</span></div>
  <div class="grid subject-grid">${SUBJECTS.map(subjectCard).join("")}</div>
  <div class="section-spacer">${wideBox("data-start-f1", "✎", "Questões 1ª fase", "10 questões sortidas de todas as matérias para você responder.", "Começar →")}</div>`;
}
function renderMateria() {
  const s = subj(ctx.subjectId);
  return `${heading("1ª FASE / " + s.name.toUpperCase(), s.name, "", `<button class="button button-quiet" data-nav="primeira">← Disciplinas</button>`)}
  <div class="panel-head"><div><h2 class="section-title">Conteúdos de ${s.name}</h2></div><span class="eyebrow">${s.modules.length} CONTEÚDOS</span></div>
  <div class="grid subject-grid topic-grid">${s.modules.map((m, i) => `<button class="subject-card topic-card" data-topic="${i}"><span class="topic-index">${pad(i + 1)}</span><strong>${safe(m[0])}</strong><small>${safe(m[1])}</small><div class="card-bottom"><span>Questões da FUVEST</span><span>↗</span></div></button>`).join("")}</div>
  <div class="section-spacer">${wideBox("data-start-var", "☰", "Questões variadas", `Questões de FUVESTs passadas sortidas de ${s.name}, de todos os conteúdos.`, "Começar →")}</div>`;
}

/* ---------- QUESTÕES (objetivas) ---------- */
function bank(key, n) {
  const custom = D.questions && D.questions[key];
  if (custom && custom.length) return custom.map((q, i) => Object.assign({ id: `${key}#${q.id ?? i}` }, q));
  return Array.from({ length: n }, (_, i) => ({ id: `${key}#m${i + 1}`, model: true, source: "FUVEST · ano da prova", text: "O enunciado da questão (com texto de apoio, imagem, gráfico ou mapa) aparecerá aqui.", options: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E"], answer: 2 }));
}
function startQuiz(origin, sid, ti) {
  let items = [], title = "", eyebrow = "";
  if (origin === "topic") { const s = subj(sid); items = bank(`${sid}|${ti}`, 3); title = s.modules[ti][0]; eyebrow = `1ª FASE / ${s.name.toUpperCase()}`; }
  else if (origin === "variadas") { const s = subj(sid); items = bank(`${sid}|var`, 3); title = "Questões variadas"; eyebrow = `1ª FASE / ${s.name.toUpperCase()}`; }
  else { const pool = SUBJECTS.slice().sort(() => Math.random() - .5).slice(0, 10); items = pool.flatMap(s => bank(`${s.id}|f1`, 1)); title = "Questões 1ª fase"; eyebrow = "1ª FASE"; }
  items = items.filter(q => !stats.done[q.id]).slice(0, 10);           // acertadas não se repetem
  ctx.subjectId = sid || null;
  ctx.quiz = { origin, sid, ti, title, eyebrow, items, i: 0, sel: null, answered: false, lastOk: false, results: [], startedAt: Date.now() };
  go("quiz");
}
function renderQuiz() {
  const q = ctx.quiz; if (!q) return renderPrimeira();
  if (simClock) { clearInterval(simClock); simClock = null; }
  const back = q.origin === "simulado" ? `<button class="button button-quiet" data-nav="simulados">← Simulados</button>` : q.origin === "fase1" ? `<button class="button button-quiet" data-nav="primeira">← 1ª fase</button>` : `<button class="button button-quiet" data-subject="${q.sid}">← ${subj(q.sid).name}</button>`;
  const head = heading(q.eyebrow, q.title, "", back);
  if (!q.items.length) return `${head}<section class="panel soon-box"><div class="soon-icon">✓</div><h2>Nada pendente por aqui</h2><p>As questões que você acertou não se repetem. Quando novas questões forem adicionadas, elas aparecem neste conteúdo.</p></section>`;
  if (q.i >= q.items.length) {
    if (simClock) { clearInterval(simClock); simClock=null; }
    const ok = q.results.filter(Boolean).length;
    if (q.origin === 'simulado' && !q.savedAttempt) { q.savedAttempt=true; const total=q.items.length,minutes=Math.max(1,Math.round((Date.now()-q.startedAt)/60000));simAttempts.unshift({id:Date.now(),label:q.title,date:new Date().toISOString(),correct:ok,total,pct:total?Math.round(ok/total*100):0,minutes});simAttempts=simAttempts.slice(0,50);store.set('simAttempts',simAttempts);checkAchievements(); }
    return `${head}<section class="panel quiz-result"><div class="eyebrow">RESULTADO</div><div class="quiz-score">${ok}<span> / ${q.items.length}</span></div><p>${ok === q.items.length ? "Você acertou todas." : "As questões erradas continuam disponíveis para você tentar de novo."}</p><div class="modal-actions">${back}<button class="button button-primary" data-nav="inicio">Ver desempenho →</button></div></section>`;
  }
  const it = q.items[q.i], L = "ABCDE";
  const timerMarkup = q.origin === 'simulado' && q.timed ? `<span class="sim-live-timer" id="simLiveTimer">00:00</span>` : '';
  if (q.origin === 'simulado' && q.timed) simClock = setInterval(() => { const el=$('#simLiveTimer'); if(el){const sec=Math.floor((Date.now()-q.startedAt)/1000);el.textContent=`${pad(Math.floor(sec/60))}:${pad(sec%60)}`;} },1000);
  return `${head}<section class="panel quiz-card"><div class="quiz-progress"><span style="width:${q.i / q.items.length * 100}%"></span></div>
  <div class="quiz-top"><span class="eyebrow">QUESTÃO ${q.i + 1} DE ${q.items.length}</span><span class="quiz-tags">${timerMarkup}${it.model ? `<em>modelo de interface</em>` : ""}<em>${safe(it.source || "FUVEST")}</em></span></div>
  <p class="quiz-text">${safe(it.text)}</p>
  <div class="quiz-options">${it.options.map((o, i) => {
    let c = "quiz-opt"; if (q.answered) { if (i === it.answer) c += " correct"; else if (i === q.sel) c += " wrong"; } else if (i === q.sel) c += " selected";
    return `<button class="${c}" data-opt="${i}" ${q.answered ? "disabled" : ""}><b>${L[i]}</b><span>${safe(o)}</span></button>`;
  }).join("")}</div>
  ${q.answered ? `<div class="quiz-feedback ${q.lastOk ? "ok" : "bad"}"><strong>${q.lastOk ? "Resposta certa!" : "Resposta errada."}</strong><span>${q.lastOk ? "Essa questão não será repetida." : `A alternativa correta é a ${L[it.answer]}. Você poderá tentar essa questão de novo depois.`}</span></div><div class="modal-actions"><button class="button button-primary" data-next>${q.i + 1 >= q.items.length ? "Ver resultado →" : "Próxima questão →"}</button></div>`
  : `<div class="modal-actions"><button class="button button-primary" id="quizAnswer" data-answer ${q.sel == null ? "disabled" : ""}>Responder</button></div>`}</section>`;
}
function answerQuiz() {
  const q = ctx.quiz; if (!q || q.sel == null || q.answered) return;
  const it = q.items[q.i], ok = q.sel === it.answer;
  q.answered = true; q.lastOk = ok; q.results.push(ok);
  stats.solved++; if (ok) { stats.correct++; stats.done[it.id] = true; }
  const subjectId = q.sid || (it.id || "").split("|")[0];
  history.unshift({ id: `${Date.now()}-${it.id}`, questionId: it.id, subjectId, subject: subj(subjectId)?.name || "Geral", title: q.title, text: it.text, options: it.options, answer: it.answer, selected: q.sel, correct: ok, date: new Date().toISOString(), source: it.source || "FUVEST", model: !!it.model });
  history = history.slice(0, 500); store.set("history", history);
  if (!ok && !review.some(x => x.questionId === it.id)) { review.unshift({ questionId: it.id, subjectId, subject: subj(subjectId)?.name || "Geral", title: q.title, text: it.text, options: it.options, answer: it.answer, selected: q.sel, addedAt: new Date().toISOString() }); store.set("review", review); }
  if (q.origin === 'review' && ok) { review=review.filter(r=>r.questionId!==it.id);store.set('review',review); }
  store.set("stats", stats); checkAchievements(); render();
}

/* ---------- 2ª FASE ---------- */
function renderSegunda() {
  const c = activeCareer;
  return `${heading("PROVA DISCURSIVA", "2ª fase", "", `<button class="button button-quiet" data-nav="carreiras">Alterar carreira ↗</button>`)}
  <div class="phase-banner"><div><div class="eyebrow">SUA CARREIRA · ${safe(c.name.toUpperCase())}</div><h3>${safe(c.unit)}</h3><p>Dia 1 comum a todos · Dia 2 com disciplinas específicas da carreira.</p></div><div class="phase-number">D1 + D2</div></div>
  <div class="grid day-cards">
    <button class="day-card" data-day="1"><span class="eyebrow">1º DIA</span><h3>Português e Redação</h3><p>10 questões dissertativas de Português e 1 redação.</p><div class="day-card-foot"><span>Comum a todas as carreiras</span><b>Entrar →</b></div></button>
    <button class="day-card" data-day="2"><span class="eyebrow">2º DIA</span><h3>Disciplinas específicas</h3><p>Questões dissertativas das disciplinas da sua carreira.</p><div class="detail-subjects">${c.subjects.map(s => `<span>${s}</span>`).join("")}</div><div class="day-card-foot"><span>Definido pela carreira</span><b>Entrar →</b></div></button>
  </div>`;
}
function examQ(label, n, id) {
  return `<article class="exam-q"><div class="exam-q-head"><span class="q-no">${n}</span><div><small>${safe(label.toUpperCase())}</small><strong>Questão ${n}</strong></div></div><p class="q-stem">O enunciado da questão ${n} (FUVEST, 2ª fase) aparecerá aqui.</p><textarea class="answer-input" data-qid="${id}" data-qlabel="${safe(label)} · Questão ${n}" rows="4" placeholder="Escreva sua resposta de acordo com o que a questão pede...">${safe(examDrafts[id] || '')}</textarea></article>`;
}
function renderDia1() {
  const back = `<button class="button button-quiet" data-nav="segunda">← 2ª fase</button>`;
  if (!ctx.model) return `${heading("2ª FASE · 1º DIA", "Escolha o modelo de redação", "", back)}
  <div class="grid model-grid">${[1, 2].map(n => `<button class="model-card" data-model="${n}"><span class="eyebrow">MODELO ${n}</span><h3>Proposta ${n}</h3><p>Modelo de redação disponibilizado pela FUVEST. A descrição completa entra junto com o conteúdo.</p><b>Escolher →</b></button>`).join("")}</div>`;
  return `${heading("2ª FASE · 1º DIA", "Português e Redação", "", back)}
  <div class="exam-note">Modelo de redação escolhido: <strong>Modelo ${ctx.model}</strong> · <button class="text-link" data-model-change>alterar</button></div>
  <div class="exam">${Array.from({ length: 10 }, (_, i) => examQ("Português", i + 1, "d1p" + (i + 1))).join("")}
  <article class="exam-q essay"><div class="exam-q-head"><span class="q-no">✎</span><div><small>REDAÇÃO · MODELO ${ctx.model}</small><strong>Tema</strong></div></div><p class="q-stem">O tema (sorteado de FUVESTs anteriores) aparecerá aqui.</p><textarea class="answer-input big" data-qid="d1red" data-qlabel="Redação · Modelo ${ctx.model}" rows="14" placeholder="Escreva sua redação..."></textarea></article>
  <div class="exam-bar"><span>☁ Ao salvar, suas respostas ficam guardadas na nuvem.</span><button class="button button-primary" data-save="1">Salvar na nuvem</button></div></div>`;
}
function renderDia2() {
  const subs = activeCareer.subjects, per = Math.ceil(12 / subs.length); let n = 0;
  const groups = subs.map(s => { const arr = []; for (let i = 0; i < per && n < 12; i++) { n++; arr.push(examQ(s, i + 1, `d2${s}${n}`)); } return `<div class="exam-group"><h2 class="section-title">${s}</h2></div>${arr.join("")}`; }).join("");
  return `${heading("2ª FASE · 2º DIA", "Disciplinas específicas", "", `<button class="button button-quiet" data-nav="segunda">← 2ª fase</button>`)}
  <div class="exam">${groups}<div class="exam-bar"><span>☁ Ao salvar, suas respostas ficam guardadas na nuvem.</span><button class="button button-primary" data-save="2">Salvar na nuvem</button></div></div>`;
}
function saveExam(day) {
  const items = $$(".answer-input").map(t => ({ label: t.dataset.qlabel, text: t.value.trim() })).filter(x => x.text);
  if (!items.length) { toast("Escreva ao menos uma resposta antes de salvar."); return; }
  if (!user) { toast("Entre ou crie sua conta para guardar na nuvem."); openAuth("entrar"); return; }
  saved.unshift({ id: Date.now(), kind: day === "1" ? "2ª fase · 1º dia" : "2ª fase · 2º dia", title: day === "1" ? "Português e Redação" : "Disciplinas específicas", career: activeCareer.name, model: day === "1" ? ctx.model : null, date: new Date().toISOString(), items });
  store.set("saved", saved); items.forEach(i=>{const key=$$('.answer-input').find(t=>t.dataset.qlabel===i.label)?.dataset.qid;if(key)delete examDrafts[key];});store.set('examDrafts',examDrafts);paintCloud(); toast("Respostas guardadas na nuvem ☁");
}

/* ---------- NUVEM (respostas salvas) ---------- */
function renderNuvem() {
  const head = heading("SUAS RESPOSTAS", "Minhas respostas");
  if (!user) return `${head}<section class="panel soon-box"><div class="soon-icon">☁</div><h2>Entre para usar a nuvem</h2><p>As respostas da 2ª fase que você salvar ficam guardadas na sua conta.</p><button class="button button-primary" data-action="login">Logar</button></section>`;
  if (!saved.length) return `${head}<section class="panel soon-box"><div class="soon-icon">☁</div><h2>Nenhuma resposta guardada ainda</h2><p>Ao concluir uma lição da 2ª fase e salvar, ela aparece aqui para você consultar quando quiser.</p></section>`;
  return `${head}<div class="saved-list">${saved.map(s => `<details class="saved-item"><summary><span><small>${safe(s.kind.toUpperCase())}</small><strong>${safe(s.title)}</strong></span><em>${new Date(s.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</em></summary><div class="saved-body">${s.items.map(i => `<div class="saved-answer"><small>${safe(i.label)}</small><p>${safe(i.text).replace(/\n/g, "<br>")}</p></div>`).join("")}<button class="button button-quiet button-small" data-del-saved="${s.id}">Excluir</button></div></details>`).join("")}</div>`;
}

/* ---------- OFICINA DE REDAÇÃO ---------- */
function renderRedacao() {
  return `${heading("LINGUAGEM, ARGUMENTO E AUTORIA", "Oficina de redação", "", `<button class="button button-quiet" data-action="new-theme">Novo tema ↻</button>`)}
  <div class="grid redacao-studio"><section class="panel essay-theme"><div class="eyebrow">TEMA</div><h2>O tema da redação aparecerá aqui</h2><p class="q-stem">Os temas são sorteados de FUVESTs anteriores. Não há certo ou errado: leia o tema e escreva.</p></section>
  <section class="panel"><div class="panel-head"><div><h2>Seu texto</h2></div><span class="eyebrow" id="wordCount">0 PALAVRAS</span></div><textarea class="answer-input big" id="oficina" rows="18" placeholder="Escreva sua redação..."></textarea><div class="modal-actions"><button class="button button-primary" data-save-oficina>Salvar na nuvem</button></div></section></div>
  <section class="panel quick-repertory-card"><div class="quick-repertory-head"><div><div class="eyebrow">EXERCÍCIO DE REPERTÓRIO</div><h2>Jogo rápido</h2><p>Leia um tema e pratique encontrar um repertório que ajude a discutir o assunto. Por enquanto, o tema ficará em aberto.</p></div><span class="quick-repertory-icon" aria-hidden="true">✎</span></div>
  <div class="quick-theme-placeholder"><span class="eyebrow">TEMA DO EXERCÍCIO</span><strong>Em breve</strong><small>Um tema será apresentado aqui.</small></div>
  <label class="quick-repertory-label" for="quickRepertory">Seu repertório</label><textarea class="answer-input quick-repertory-input" id="quickRepertory" rows="4" placeholder="Pense em um livro, filme, conceito, acontecimento histórico, autor ou dado que poderia ser usado em uma redação..."></textarea>
  <div class="quick-repertory-footer"><small>Escreva apenas o repertório e, se quiser, uma frase explicando sua relação com o tema.</small><button class="button button-primary" data-save-quick>Guardar exercício</button></div></section>
  <section class="panel writing-path-panel"><div class="eyebrow">TREINAMENTO EM ETAPAS</div><h2>Trilhas de escrita</h2><p class="muted-copy">Pratique uma habilidade por vez e acompanhe o que já treinou.</p><div class="writing-path-grid">${[['tese','Construção de tese','Formule um posicionamento claro para um tema.'],['argumentacao','Argumentação','Desenvolva uma justificativa e explique sua consequência.'],['conectivos','Conectivos','Relacione ideias com progressão e clareza.'],['introducao','Introdução','Organize repertório, contexto, problema e tese.']].map(([id,n,d])=>`<article class="writing-path-card"><div><strong>${n}</strong><small>${d}</small></div><span class="path-status ${writingProgress[id]?'done':''}">${writingProgress[id]?'Praticado':'Pendente'}</span><button class="button button-quiet button-small" data-writing="${id}">Praticar →</button></article>`).join('')}</div></section>`;
}

/* ---------- PLANO DE ESTUDOS ---------- */
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function renderPlan() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), todayK = dkey(now);
  const offset = (new Date(y, m, 1).getDay() + 6) % 7, total = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => { const d = new Date(y, m, 1 - offset + i), k = dkey(d), cur = d.getMonth() === m, list = cur ? (plan[k] || []) : [];
    return `<div class="calendar-day ${cur ? "" : "muted"} ${k === todayK ? "today" : ""} ${cur && ctx.planEdit ? "editable" : ""}" ${cur && ctx.planEdit ? `data-plan-day="${k}"` : ""}><strong>${d.getDate()}</strong>${list.slice(0, 3).map(x => `<span class="cal-task">${safe(x)}</span>`).join("")}${list.length > 3 ? `<span class="cal-more">+${list.length - 3}</span>` : ""}</div>`; }).join("");
  const counts = {}; Object.keys(plan).forEach(k => (plan[k] || []).forEach(x => counts[x] = (counts[x] || 0) + 1));
  const has = Object.keys(counts).length;
  return `${heading("ORGANIZAÇÃO", "Plano de estudos")}
  <div class="grid plan-layout"><section class="panel"><div class="panel-head"><div><h2>Sua semana</h2></div><div class="plan-head-right"><span class="eyebrow">${MONTHS[m].toUpperCase()} DE ${y}</span><button class="button button-quiet button-small" data-plan-edit>${ctx.planEdit ? "Concluir" : "Editar plano"}</button></div></div>
  ${ctx.planEdit ? `<div class="plan-banner">Modo edição: clique em um dia para escolher o que estudar.</div>` : ""}
  <div class="calendar-grid">${["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map(d => `<div class="week-day">${d}</div>`).join("")}${cells}</div></section>
  <aside class="panel"><div class="panel-head"><div><h2>Minha rotina</h2></div></div>${has ? `<div class="routine-list">${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="routine-row"><span>${safe(k)}</span><b>${v} ${v === 1 ? "dia" : "dias"}</b></div>`).join("")}</div>` : `<div class="empty-state">Seu plano ainda está vazio.</div>`}<button class="button button-primary" style="margin-top:14px" data-plan-edit>${has ? "Editar plano" : "Criar meu plano"}</button><div class="plan-goal"><label for="weeklyGoal">Meta semanal de horas</label><div class="goal-control"><input id="weeklyGoal" type="number" min="1" max="80" value="${store.get('weeklyGoal',15)}"><button class="button button-quiet button-small" data-save-goal>Salvar</button></div><small>Tempo registrado nesta semana: ${weeklyMinutes()} min</small></div></aside></div>
  <section class="panel today-plan"><div class="panel-head"><div><div class="eyebrow">EXECUÇÃO</div><h2>Plano de hoje</h2></div><span class="eyebrow">${todayK}</span></div>${(plan[todayK]||[]).length ? `<div class="today-task-list">${plan[todayK].map(x=>`<label class="today-task"><input type="checkbox" data-task-done="${safe(x)}" ${planDone[todayK+'|'+x]?'checked':''}><span>${safe(x)}</span></label>`).join('')}</div>` : '<p class="muted-copy">Adicione disciplinas ao dia de hoje usando “Editar plano”.</p>'}<div class="study-time-entry"><label for="studyMinutesInput">Tempo estudado hoje (minutos)</label><input id="studyMinutesInput" type="number" min="0" max="1440" value="${studyMinutes[todayK]||0}"><button class="button button-quiet button-small" data-save-minutes>Registrar tempo</button></div></section>`;
}
function openPlanDay(k) {
  const [y, mo, d] = k.split("-").map(Number), sel = plan[k] || [], opts = SUBJECTS.map(s => s.name).concat("Redação");
  openModal(`<div class="eyebrow">PLANO DE ESTUDOS</div><h2>${d} de ${MONTHS[mo - 1]}</h2><p>O que você quer estudar neste dia?</p><div class="chip-picker">${opts.map(o => `<button type="button" class="pick-chip ${sel.includes(o) ? "on" : ""}" data-plan-chip="${safe(o)}">${safe(o)}</button>`).join("")}</div><div class="modal-actions"><button class="button button-quiet" data-plan-clear="${k}">Limpar dia</button><button class="button button-primary" data-plan-save="${k}">Salvar</button></div>`);
}

/* ---------- EXTRAS: ferramentas disponíveis para todas as carreiras ---------- */
function renderExtras() {
  const cards = [
    ["mapa", "◎", "Mapa ao vivo", "Notícias e acontecimentos atuais, organizados para estudo.", "MAPAS E ATUALIDADES"],
    ["lorenz", "∿", "Curva de Lorenz", "Explore a representação gráfica da distribuição de renda.", "MAPAS E GRÁFICOS"],
    ["jogo", "▶", "Jogo rápido", "Pratique fórmulas e conceitos em desafios curtos.", "DESAFIOS"],
    ["formulas", "ƒ", "Caderno de fórmulas", "Consulte fórmulas importantes de Matemática e Física.", "CONSULTA" ]
  ];
  return `${heading("FERRAMENTAS COMPLEMENTARES", "Extras")}<p class="muted-copy page-intro extras-intro">Ferramentas de apoio que podem ser usadas por qualquer estudante, independentemente da carreira escolhida.</p><div class="extras-grid">${cards.map(([id,icon,title,desc,tag])=>`<button class="extra-card" data-nav="${id}" aria-label="Abrir ${title}"><span class="extra-card-icon">${icon}</span><span class="extra-card-tag">${tag}</span><strong>${title}</strong><small>${desc}</small><span class="extra-card-open">Abrir <b>↗</b></span></button>`).join("")}</div>`;
}
function renderSoon() {
  const t = { mapa: ["MAPAS E GRÁFICOS", "Mapa ao vivo", "Notícias reais, atualizadas todos os dias às 6h."], lorenz: ["MAPAS E GRÁFICOS", "Curva de Lorenz", "O gráfico da curva de Lorenz ficará aqui."], jogo: ["DESAFIOS", "Jogo rápido", "Perguntas de “como se escreve a fórmula…” com correção após a resposta."], formulas: ["CONSULTA", "Caderno de fórmulas", "As fórmulas de Matemática e Física mais usadas nos vestibulares."] }[view];
  return emptyPage(t[0], t[1], t[2]);
}

/* ---------- NOVO PAINEL DE PREPARAÇÃO ---------- */
function subjectPerformance(){
 const map={}; history.forEach(h=>{const k=h.subject||'Geral';map[k]??={total:0,correct:0};map[k].total++;if(h.correct)map[k].correct++;});
 return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
}
function weeklyMinutes(){const now=new Date(),day=(now.getDay()+6)%7,start=new Date(now);start.setDate(now.getDate()-day);start.setHours(0,0,0,0);return Object.entries(studyMinutes).reduce((n,[k,v])=>{const d=new Date(k+'T12:00:00');return d>=start&&d<=now?n+Number(v||0):n;},0);}
function checkAchievements(){const defs=[['primeiro','Primeiro passo','Resolver a primeira questão',stats.solved>=1],['cinquenta','Persistência','Resolver 50 questões',stats.solved>=50],['matematica','Matemático','Acertar 20 questões de Matemática',history.filter(h=>h.subject==='Matemática'&&h.correct).length>=20],['semana','Consistência','Estudar em 7 dias diferentes',Object.values(studyMinutes).filter(v=>v>0).length>=7],['revisao','Aprender com erros','Revisar 10 questões',store.get('reviewedCount',0)>=10],['simulado','Em ritmo de prova','Concluir um simulado',simAttempts.length>=1]];defs.forEach(([id,title,desc,ok])=>{if(ok&&!achievements.includes(id)){achievements.push(id);toast('Conquista desbloqueada: '+title);}});store.set('achievements',achievements);}
function renderPreparation(){const perf=subjectPerformance(),pct=stats.solved?Math.round(stats.correct/stats.solved*100):0,goal=Number(store.get('weeklyGoal',15))*60,mins=weeklyMinutes(),target=Number(store.get('targetPct',75)),weak=perf.filter(x=>x[1].total>=2).sort((a,b)=>(a[1].correct/a[1].total)-(b[1].correct/b[1].total))[0],nextStep=review.length?`Comece revisando ${review.length} questão(ões) que você errou.`:weak?`Priorize ${weak[0]}: seu aproveitamento atual nessa disciplina é ${Math.round(weak[1].correct/weak[1].total*100)}%.`:'Responda questões de diferentes disciplinas para montar seu diagnóstico.';return `${heading('PAINEL DE ACOMPANHAMENTO','Minha preparação')}<div class="grid prep-kpis">${stat('Questões respondidas',stats.solved,'em todas as sessões','✓')}${stat('Aproveitamento',pct+'%',`${stats.correct} acertos`,'%')}${stat('Para revisar',review.length,'questões erradas guardadas','↻')}${stat('Tempo nesta semana',Math.floor(mins/60)+'h '+(mins%60)+'min',`meta: ${Math.floor(goal/60)}h`,'◷')}</div><section class="panel next-step-panel"><div><div class="eyebrow">PRÓXIMO PASSO SUGERIDO</div><h2>O que fazer agora?</h2><p>${nextStep}</p></div><button class="button button-primary" data-nav="${review.length?'revisar':'primeira'}">${review.length?'Revisar agora':'Continuar estudando'} →</button></section><section class="panel target-performance"><div><div class="eyebrow">META PESSOAL</div><h2>Meta de aproveitamento</h2><p>Defina uma referência própria para acompanhar seu progresso. Não é uma nota de corte oficial nem uma previsão de aprovação.</p></div><div class="target-performance-control"><strong>${pct}%</strong><span>atual</span><input id="targetPct" type="number" min="1" max="100" value="${target}" aria-label="Meta de aproveitamento em porcentagem"><span>meta %</span><button class="button button-quiet button-small" data-save-target>Salvar</button></div><div class="target-progress"><i style="width:${Math.min(100,pct/Math.max(1,target)*100)}%"></i></div></section><section class="panel"><div class="panel-head"><div><div class="eyebrow">ANÁLISE DE DESEMPENHO</div><h2>Desempenho por disciplina</h2></div><span class="eyebrow">BASEADO NAS SUAS RESPOSTAS</span></div>${perf.length?`<div class="subject-performance-list">${perf.map(([name,v])=>{const p=Math.round(v.correct/v.total*100);return `<div class="subject-performance-row"><div><strong>${safe(name)}</strong><small>${v.correct}/${v.total} acertos · ${p}%</small></div><div class="mini-track"><i style="width:${p}%"></i></div></div>`}).join('')}</div>`:'<div class="empty-state">Responda algumas questões para formar seu diagnóstico por disciplina.</div>'}</section><div class="grid prep-two"><section class="panel"><div class="panel-head"><div><div class="eyebrow">REVISÃO</div><h2>Seus pontos de atenção</h2></div><button class="text-link" data-nav="revisar">Ver tudo →</button></div>${review.slice(0,4).map(r=>`<div class="attention-row"><span>${safe(r.subject)}</span><strong>${safe(r.title)}</strong></div>`).join('')||'<p class="muted-copy">Nenhuma questão pendente de revisão.</p>'}</section><section class="panel"><div class="panel-head"><div><div class="eyebrow">EVOLUÇÃO</div><h2>Últimas tentativas</h2></div></div>${renderAttemptBars()}</section></div><section class="panel"><div class="panel-head"><div><div class="eyebrow">CONQUISTAS</div><h2>Marcos da sua preparação</h2></div><span class="eyebrow">${achievements.length} DESBLOQUEADAS</span></div><div class="achievement-grid">${[['primeiro','Primeiro passo','Primeira questão'],['cinquenta','Persistência','50 questões'],['matematica','Matemático','20 acertos em Matemática'],['semana','Consistência','7 dias de estudo'],['revisao','Aprender com erros','10 revisões'],['simulado','Em ritmo de prova','Primeiro simulado']].map(([id,n,d])=>`<div class="achievement ${achievements.includes(id)?'unlocked':''}"><b>${achievements.includes(id)?'✓':'◇'}</b><span><strong>${n}</strong><small>${d}</small></span></div>`).join('')}</div></section>`;}
function renderAttemptBars(){if(!simAttempts.length)return '<p class="muted-copy">Conclua simulados para comparar seus resultados.</p>';return `<div class="attempt-bars">${simAttempts.slice(0,6).reverse().map(a=>`<div><span>${safe(a.label)}</span><b>${a.pct}%</b><i><em style="width:${a.pct}%"></em></i></div>`).join('')}</div>`;}
function renderReview(){return `${heading('APRENDIZAGEM ATIVA','Revisar questões')}<p class="muted-copy page-intro">Questões que você errou ficam reunidas aqui para uma nova tentativa. Remova da lista quando sentir que consolidou o conteúdo.</p>${review.length?`<div class="review-list">${review.map((r,i)=>`<article class="panel review-card"><div class="review-meta"><span>${safe(r.subject)}</span><small>${new Date(r.addedAt).toLocaleDateString('pt-BR')}</small></div><h3>${safe(r.title)}</h3><p>${safe(r.text)}</p><div class="review-options">${(r.options||[]).map((o,j)=>`<div class="${j===r.answer?'is-answer':''}"><b>${'ABCDE'[j]}</b>${safe(o)}</div>`).join('')}</div><div class="review-foot"><span>Resposta correta: ${'ABCDE'[r.answer]||'—'}</span><div class="review-actions"><button class="button button-primary button-small" data-review-retry="${i}">Tentar novamente</button><button class="button button-quiet button-small" data-review-done="${i}">Marcar como revisada</button></div></div></article>`).join('')}</div>`:'<section class="panel empty-state-panel"><h2>Você está em dia!</h2><p>Quando errar uma questão, ela aparecerá aqui automaticamente.</p><button class="button button-primary" data-nav="primeira">Continuar estudando</button></section>'}`;}
function renderSimulados(){const subs=SUBJECTS.map(s=>`<option value="${s.id}">${safe(s.name)}</option>`).join('');return `${heading('TREINO EM CONDIÇÕES DE PROVA','Simulados')}<section class="panel sim-setup"><div class="eyebrow">MONTE SUA SESSÃO</div><h2>Como você quer treinar?</h2><p class="muted-copy">Escolha uma disciplina ou faça uma sessão geral. O cronômetro registra o tempo da tentativa.</p><div class="sim-controls"><label>Formato<select id="simSubject"><option value="all">Primeira fase · geral</option>${subs}</select></label><label>Quantidade<select id="simCount"><option>10</option><option>30</option><option>90</option></select></label><label class="sim-timer-choice"><input type="checkbox" id="simTimer" checked> Cronometrar</label></div><button class="button button-primary" data-start-sim>Iniciar simulado →</button></section><section class="panel"><div class="panel-head"><div><div class="eyebrow">SEU HISTÓRICO</div><h2>Tentativas anteriores</h2></div></div>${simAttempts.length?`<div class="sim-history">${simAttempts.map(a=>`<div><span><strong>${safe(a.label)}</strong><small>${new Date(a.date).toLocaleString('pt-BR')}</small></span><b>${a.correct}/${a.total} · ${a.pct}%</b><small>${a.minutes} min</small></div>`).join('')}</div>`:'<p class="muted-copy">Seus simulados concluídos aparecerão aqui.</p>'}</section>`;}
function renderRadar(){const total=SUBJECTS.reduce((n,s)=>n+s.modules.reduce((m,g)=>m+g[2].length,0),0);return `${heading('LEITURA ESTRATÉGICA','Radar FUVEST')}<section class="panel radar-intro"><div class="eyebrow">VISÃO DO PROGRAMA</div><h2>Organize o estudo por conteúdo</h2><p>O radar reúne os conteúdos cadastrados no Vértice e permite acompanhar o que já foi trabalhado. Frequências históricas só serão exibidas quando houver uma base de provas classificada e conferida — não usamos estimativas como se fossem estatísticas oficiais.</p><div class="radar-total"><strong>${total}</strong><span>tópicos mapeados no programa atual</span></div></section><div class="grid radar-subjects">${SUBJECTS.map(s=>{const topics=s.modules.reduce((n,g)=>n+g[2].length,0),seen=history.filter(h=>h.subject===s.name).length;return `<button class="radar-subject" data-subject="${s.id}">${subjectMark(s)}<span><strong>${safe(s.name)}</strong><small>${topics} tópicos · ${seen} respostas registradas</small></span><b>→</b></button>`}).join('')}</div>`;}
function renderKnowledge(){return `${heading('VISÃO DO SEU PROGRESSO','Mapa de conhecimento')}<p class="muted-copy page-intro">Cada módulo muda de estado conforme suas respostas registradas: ainda não explorado, em desenvolvimento ou com bom desempenho.</p>${SUBJECTS.map(s=>`<section class="panel knowledge-subject"><div class="panel-head">${subjectMark(s)}<h2>${safe(s.name)}</h2></div><div class="knowledge-grid">${s.modules.map(m=>{const hs=history.filter(h=>h.subject===s.name&&h.title===m[0]),p=hs.length?Math.round(hs.filter(h=>h.correct).length/hs.length*100):0,state=!hs.length?'untouched':p>=75?'strong':'working';return `<div class="knowledge-topic ${state}"><span>${state==='strong'?'●':state==='working'?'◐':'○'}</span><strong>${safe(m[0])}</strong><small>${hs.length?`${p}% · ${hs.length} respostas`:'Ainda não explorado'}</small></div>`}).join('')}</div></section>`).join('')}`;}
function renderNotebook(){return `${heading('SEU ESPAÇO DE ESTUDO','Caderno pessoal')}<section class="panel note-editor"><div class="eyebrow">NOVA ANOTAÇÃO</div><div class="note-fields"><label>Título<input id="noteTitle" maxlength="90" placeholder="Ex.: Segunda lei de Newton"></label><label>Disciplina<select id="noteSubject"><option>Geral</option>${SUBJECTS.map(s=>`<option>${safe(s.name)}</option>`).join('')}</select></label></div><textarea id="noteBody" class="answer-input" rows="5" placeholder="Registre fórmulas, conceitos, datas, repertórios ou observações..."></textarea><button class="button button-primary" data-add-note>Salvar anotação</button></section><div class="notes-list">${notes.length?notes.map(n=>`<article class="panel note-card"><div><span class="eyebrow">${safe(n.subject)}</span><h3>${safe(n.title)}</h3><p>${safe(n.body).replace(/\n/g,'<br>')}</p><small>${new Date(n.date).toLocaleDateString('pt-BR')}</small></div><button class="button button-quiet button-small" data-delete-note="${n.id}">Excluir</button></article>`).join(''):'<div class="empty-state">Seu caderno ainda está vazio.</div>'}</div>`;}
function renderSkillTracks(){const tracks=[['tese','Construção de tese','Escreva uma tese que responda diretamente ao recorte do tema.'],['argumentacao','Argumentação','Apresente uma razão, explique-a e mostre sua consequência.'],['conectivos','Conectivos','Reescreva duas frases conectando-as sem repetir ideias.'],['introducao','Introdução','Organize repertório, contextualização, problema e duas teses.'],['leitura','Leitura de enunciado','Identifique comando, dados e restrições de uma questão.'],['resolucao','Estratégia de resolução','Registre o caminho escolhido antes de calcular.']];return `${heading('TREINAMENTO ORIENTADO','Trilhas de habilidades')}<p class="muted-copy page-intro">Pequenos exercícios para praticar uma habilidade específica. Salve cada prática para acompanhar seu percurso.</p><div class="skill-track-grid">${tracks.map(([id,n,d])=>`<article class="panel skill-track"><div class="eyebrow">${writingProgress[id]?'CONCLUÍDA':'ETAPA DE TREINO'}</div><h3>${n}</h3><p>${d}</p><button class="button ${writingProgress[id]?'button-quiet':'button-primary'} button-small" data-writing="${id}">${writingProgress[id]?'Praticar novamente':'Começar →'}</button></article>`).join('')}</div>`;}
function openWritingExercise(id){const names={tese:'Construção de tese',argumentacao:'Argumentação',conectivos:'Conectivos',introducao:'Introdução',leitura:'Leitura de enunciado',resolucao:'Estratégia de resolução'};openModal(`<div class="eyebrow">TRILHA DE HABILIDADES</div><h2>${names[id]||'Exercício'}</h2><p>Faça sua prática no campo abaixo. O Vértice registra a conclusão, mas não atribui nota automática.</p><textarea id="writingExerciseText" class="answer-input" rows="7" placeholder="Registre sua tentativa..."></textarea><div class="modal-actions"><button class="button button-primary" data-finish-writing="${id}">Salvar prática</button></div>`);}

/* ---------- render ---------- */
function render() {
  const map = { inicio: renderHome, carreiras: renderCareers, primeira: renderPrimeira, materia: renderMateria, quiz: renderQuiz, segunda: renderSegunda, dia1: renderDia1, dia2: renderDia2, redacao: renderRedacao, extras: renderExtras, plano: renderPlan, nuvem: renderNuvem, mapa: renderSoon, lorenz: renderSoon, jogo: renderSoon, formulas: renderSoon, preparacao: renderPreparation, revisar: renderReview, simulados: renderSimulados, radar: renderRadar, conhecimento: renderKnowledge, caderno: renderNotebook, trilhas: renderSkillTracks };
  page.innerHTML = (map[view] || renderHome)();
}

/* ---------- perfil / nuvem no cabeçalho ---------- */
function paintProfile() {
  const on = !!user, ini = on ? (user.name.trim().charAt(0) || "").toUpperCase() : "";
  $$(".avatar,.top-avatar").forEach(a => { a.textContent = ini; a.classList.toggle("empty", !on); });
  $("#profileName").textContent = on ? user.name : "Logar";
  $("#profileSub").textContent = on ? "Minha preparação" : "Entre ou crie sua conta";
  $("#topProfile").setAttribute("aria-label", on ? user.name : "Logar");
}
function paintCloud() { $("#cloudButton").classList.toggle("has-saved", saved.length > 0); }
function profileModal() {
  if (!user) { openAuth("entrar"); return; }
  openModal(`<div class="eyebrow">PERFIL</div><h2>${safe(user.name)}</h2><p>${safe(user.email)}</p><div class="detail-box"><strong>Sua carreira</strong><p>${safe(activeCareer.name)} · ${safe(activeCareer.unit)}</p></div><div class="modal-actions"><button class="button button-quiet" data-action="tour">Rever tutorial</button><button class="button button-quiet" data-action="logout">Sair</button></div>`);
}

/* ---------- login / cadastro (visual; e-mail real virá com Supabase) ---------- */
let authTab = "entrar";
function openAuth(tab) {
  authTab = tab || "entrar"; closeModal();
  let el = $("#authScreen"); if (!el) { el = document.createElement("div"); el.id = "authScreen"; el.className = "auth-screen"; document.body.appendChild(el); }
  const login = authTab === "entrar";
  el.innerHTML = `<div class="auth-card"><button class="auth-close" data-auth-close aria-label="Fechar">×</button>
  <div class="auth-brand"><span class="brand-symbol"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 31 18.7 6h2.6L35 31H5Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12.5 25h15M16.2 18h7.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="31" r="2" fill="currentColor"/></svg></span><span>vértice<b>.</b></span></div>
  <div class="auth-kicker">PREPARE • PRATIQUE • EVOLUA</div>
  <h2>${login ? "Que bom ter você <em>de volta.</em>" : "Seu próximo nível <em>começa aqui.</em>"}</h2>
  <p class="auth-lead">Entre na sua conta ou crie uma para acompanhar sua evolução no Vértice.</p>
  <div class="auth-tabs"><button class="${login ? "on" : ""}" data-auth-tab="entrar">Entrar</button><button class="${login ? "" : "on"}" data-auth-tab="criar">Criar conta</button></div>
  ${login ? "" : `<label class="auth-field"><span>Como podemos te chamar?</span><input id="authName" autocomplete="nickname" placeholder="Seu nome"></label>`}
  <label class="auth-field"><span>Seu e-mail</span><input id="authEmail" type="email" autocomplete="email" placeholder="voce@email.com"></label>
  <label class="auth-field"><span>${login ? "Senha" : "Crie uma senha"}</span><input id="authPass" type="password" autocomplete="${login ? "current-password" : "new-password"}" placeholder="${login ? "Digite sua senha" : "Pelo menos 6 caracteres"}"></label>
  ${login ? "" : `<label class="auth-field"><span>Senha novamente</span><input id="authPass2" type="password" autocomplete="new-password" placeholder="Repita sua senha"></label>`}
  <div class="auth-error" id="authError" role="alert"></div>
  <button class="auth-submit" data-auth-submit>${login ? "Entrar na minha conta" : "Criar minha conta"} <span>→</span></button>
  <div class="auth-note"><span>✦</span><p>Seu progresso merece um lugar seguro.<br><b>Em breve, sincronizado na sua conta.</b></p></div>
  <small class="auth-legal">Ao continuar, você concorda em usar o Vértice de forma responsável.</small></div>`;
  setTimeout(() => $(login ? "#authEmail" : "#authName")?.focus(), 30);
}
function closeAuth() { $("#authScreen")?.remove(); }
function submitAuth() {
  const err = m => { $("#authError").textContent = m; };
  const email = ($("#authEmail").value || "").trim(), pass = $("#authPass").value || "";
  if (authTab === "criar") {
    const name = ($("#authName").value || "").trim();
    if (!name) return err("Diga como podemos te chamar.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Digite um e-mail válido.");
    if (pass.length < 6) return err("A senha precisa ter pelo menos 6 caracteres.");
    if (pass !== $("#authPass2").value) return err("As senhas não coincidem.");
    user = { name, email }; store.set("user", user); closeAuth(); paintProfile(); if (view === "nuvem") render(); toast(`Olá, ${name}!`);
  } else {
    if (!email || !pass) return err("Preencha e-mail e senha.");
    err("O login por e-mail será conectado ao Supabase. Por enquanto, use “Criar conta” para testar a interface.");
  }
}

/* ---------- tema ---------- */
function applyTheme(career) {
  const key = areaKey(career.area), p = AREAS[key], root = document.documentElement;
  document.body.dataset.area = key;
  root.style.setProperty("--theme-accent", p.accent); root.style.setProperty("--theme-accent-soft", p.soft);
  root.style.setProperty("--theme-deep", p.deep); root.style.setProperty("--theme-hover", p.hover);
}
function selectCareer(id, fromPicker) {
  const found = D.careers.find(c => c.id === id); if (!found) return;
  activeCareer = found; applyTheme(found);
  if (fromPicker) {
    const picker = $("#coursePicker"); picker.classList.add("closing");
    setTimeout(() => { picker.remove(); go("inicio"); if (tourPending) { tourPending = false; startTour(); } }, 240);
  } else { toast("Curso atualizado: " + found.name); render(); }
}

/* ---------- seleção de curso + apresentação do mascote ---------- */
function showCoursePicker(first) {
  const picker = $("#coursePicker"); if (!picker) return;
  const groups = ["Ciências Humanas", "Ciências Exatas", "Ciências Biológicas", "Ciências Biológicas/Exatas"];
  const labels = { "Ciências Humanas": "Humanas", "Ciências Exatas": "Exatas", "Ciências Biológicas": "Biológicas", "Ciências Biológicas/Exatas": "Bio + Exatas" };
  const draw = (query = "", filter = "Todas") => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const visible = D.careers.filter(c => (filter === "Todas" || c.area === filter) && (`${c.name} ${c.unit} ${c.area} ${c.code}`).toLocaleLowerCase("pt-BR").includes(q));
    const sections = (filter === "Todas" ? groups : [filter]).map(area => { const list = visible.filter(c => c.area === area); if (!list.length) return "";
      return `<section class="picker-group" data-group="${areaKey(area)}"><div class="picker-group-title"><span class="area-dot"></span><h2>${labels[area]}</h2><small>${list.length} opções</small></div><div class="picker-grid">${list.map(c => `<button class="picker-card" data-pick="${c.id}" data-area="${areaKey(c.area)}"><span class="picker-card-dot"></span><span class="picker-card-copy"><strong>${safe(c.name)}</strong><small>${safe(c.unit)} · ${safe(c.period)}</small><em>2ª fase: ${safe(c.subjects.join(" · "))}</em></span><span class="picker-arrow">↗</span></button>`).join("")}</div></section>`; }).join("");
    $("#pickerResults").innerHTML = sections || `<div class="picker-empty">Nenhum curso encontrado.</div>`;
    $$("[data-pick]", picker).forEach(b => b.onclick = () => selectCareer(b.dataset.pick, true));
  };
  picker.innerHTML = `<div class="picker-shell"><div class="picker-brand"><span class="brand-symbol"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 31 18.7 6h2.6L35 31H5Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12.5 25h15M16.2 18h7.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="31" r="2" fill="currentColor"/></svg></span><span>VÉRTICE <small>PREPARAÇÃO FUVEST</small></span></div><div class="picker-intro"><div class="eyebrow">PERSONALIZE SEU ESPAÇO</div><h1>Qual seu curso escolhido?</h1><p>Escolha uma opção para definir a identidade visual e a rota da sua preparação.</p></div><div class="picker-tools"><label class="picker-search">⌕ <input id="pickerSearch" type="search" placeholder="Buscar curso, campus ou área..."></label><div class="picker-filters">${["Todas", ...groups].map(a => `<button class="picker-filter ${a === "Todas" ? "active" : ""}" data-pfilter="${a}">${a === "Todas" ? "Todas" : labels[a]}</button>`).join("")}</div></div><div id="pickerResults" class="picker-results"></div><div class="picker-foot">Catálogo baseado no Guia de Carreiras FUVEST 2027 · USP</div></div>`;
  let filter = "Todas"; draw();
  $("#pickerSearch").oninput = e => draw(e.target.value, filter);
  $$("[data-pfilter]", picker).forEach(b => b.onclick = () => { filter = b.dataset.pfilter; $$("[data-pfilter]", picker).forEach(x => x.classList.toggle("active", x === b)); draw($("#pickerSearch").value, filter); });
  if (first) { tourPending = true; showMascotIntro(picker); }
}
function showMascotIntro(picker) {
  const overlay = document.createElement("div");
  overlay.className = "mascot-intro"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-label", "Apresentação do Vértice");
  overlay.innerHTML = `<div class="intro-continue" role="button" tabindex="0" aria-label="Continuar apresentação"><span class="intro-speaker">Vértice</span><span class="intro-bubble"><span class="intro-text" aria-live="polite"></span><span class="intro-caret">▼</span></span>${mascotMarkup("intro-mascot")}<span class="intro-hint">Clique em qualquer lugar para continuar</span></div>`;
  picker.appendChild(overlay);
  const lines = ["Olá, eu sou o Vértice!", "Vamos começar, qual curso você deseja escolher?"];
  const textEl = overlay.querySelector(".intro-text");
  let li = 0, ci = 0, typing = false, timer = null, dismissed = false;
  function typeLine() { clearInterval(timer); ci = 0; typing = true; textEl.textContent = ""; timer = setInterval(() => { ci++; textEl.textContent = lines[li].slice(0, ci); if (ci >= lines[li].length) { clearInterval(timer); typing = false; overlay.classList.add("ready"); } }, 42); }
  function advance() {
    if (dismissed) return;
    if (typing) { clearInterval(timer); textEl.textContent = lines[li]; typing = false; overlay.classList.add("ready"); return; }
    if (li < lines.length - 1) { li++; overlay.classList.remove("ready"); typeLine(); return; }
    dismissed = true; clearInterval(timer); overlay.classList.add("leaving"); setTimeout(() => overlay.remove(), 360);
  }
  overlay.addEventListener("click", advance);
  overlay.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); } });
  overlay.tabIndex = 0; typeLine();
}

/* ---------- Vértice ensinando a mexer no site ---------- */
function tourSteps() {
  const s = [{ t: "Pronto! Este é o seu espaço no Vértice. Vou te mostrar rapidinho como tudo funciona." },
    { sel: ".primary-nav", side: true, t: "Na barra lateral você navega entre a Visão geral, as Carreiras, a 1ª e a 2ª fase, a Oficina de redação, os Extras e o Plano de estudos." },
    { sel: '.nav-link[data-nav="extras"]', side: true, t: "Em Extras ficam reunidas ferramentas complementares, disponíveis para qualquer carreira. É só abrir a aba e escolher uma delas." }];
  s.push({ sel: ".stats-3", t: "Na Visão geral aparece o seu desempenho: questões resolvidas, porcentagem de acertos e a nota de corte do ano passado." });
  s.push({ sel: "#cloudButton", t: "Na nuvem ficam guardadas as respostas da 2ª fase que você salvar, para você consultar quando quiser." });
  s.push({ sel: "#profileButton", side: true, t: user ? "Aqui fica o seu perfil." : "Aqui você faz login ou cria sua conta. Seu nome e sua inicial aparecem no lugar de “Logar”." });
  s.push({ t: "É isso! Bons estudos. Eu continuo por aqui, na Visão geral." });
  return s;
}
function startTour() {
  if (tourClose) tourClose();
  const steps = tourSteps(); let i = 0;
  const root = document.createElement("div"); root.className = "tour";
  root.innerHTML = `<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite"><div class="tour-mascot">${mascotMarkup("")}</div><div class="tour-bubble"><span class="tour-count"></span><p class="tour-text"></p><div class="tour-actions"><button class="tour-skip" type="button">Pular</button><button class="tour-next button button-primary" type="button"></button></div></div></div>`;
  document.body.appendChild(root);
  const spot = $(".tour-spot", root), text = $(".tour-text", root), count = $(".tour-count", root), next = $(".tour-next", root);
  const mobile = () => window.matchMedia("(max-width:820px)").matches;
  function place() {
    const st = steps[i], el = st.sel ? $(st.sel) : null;
    if (!el) { root.classList.add("center"); spot.style.opacity = 0; return; }
    root.classList.remove("center"); const r = el.getBoundingClientRect(), p = 8;
    Object.assign(spot.style, { opacity: 1, left: r.left - p + "px", top: r.top - p + "px", width: r.width + p * 2 + "px", height: r.height + p * 2 + "px" });
  }
  function show() {
    const st = steps[i]; if (mobile()) $("#sidebar").classList.toggle("open", !!st.side);
    text.textContent = st.t; count.textContent = `${i + 1} / ${steps.length}`; next.textContent = i === steps.length - 1 ? "Começar" : "Próximo →";
    const el = st.sel ? $(st.sel) : null; if (el && !st.side) el.scrollIntoView({ block: "center", behavior: "instant" });
    if (mobile() && st.side && el) setTimeout(() => { $("#sidebar").scrollTop = Math.max(0, el.offsetTop - 90); }, 120);
    setTimeout(place, mobile() && st.side ? 340 : 80);
  }
  function close() { window.removeEventListener("resize", place); root.remove(); $("#sidebar").classList.remove("open"); tourClose = null; }
  next.onclick = () => { if (i < steps.length - 1) { i++; show(); } else close(); };
  $(".tour-skip", root).onclick = close; window.addEventListener("resize", place); tourClose = close; show();
}

/* ---------- modal ---------- */
function openModal(content) { modalContent.innerHTML = content; modal.classList.add("open"); $("#modalOk")?.addEventListener("click", closeModal); }
function closeModal() { modal.classList.remove("open"); }
function info(title, text) { openModal(`<div class="eyebrow">VÉRTICE · PROTÓTIPO</div><h2>${title}</h2><p>${text}</p><div class="modal-actions"><button class="button button-primary" id="modalOk">Entendi</button></div>`); }

/* ---------- eventos (delegados) ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-nav],[data-subject],[data-topic],[data-start-var],[data-start-f1],[data-opt],[data-answer],[data-next],[data-career],[data-career-filter],[data-day],[data-model],[data-model-change],[data-save],[data-save-oficina],[data-save-quick],[data-del-saved],[data-plan-edit],[data-plan-day],[data-plan-chip],[data-plan-save],[data-plan-clear],[data-save-goal],[data-save-target],[data-task-done],[data-save-minutes],[data-start-sim],[data-review-done],[data-review-retry],[data-add-note],[data-delete-note],[data-writing],[data-finish-writing],[data-action],[data-auth-tab],[data-auth-submit],[data-auth-close]");
  if (!t) return; const d = t.dataset;
  if (d.nav) return go(d.nav);
  if (d.subject) return go("materia", { subjectId: d.subject });
  if (d.topic != null) return startQuiz("topic", ctx.subjectId, Number(d.topic));
  if ("startVar" in d) return startQuiz("variadas", ctx.subjectId);
  if ("startF1" in d) return startQuiz("fase1", null);
  if (d.opt != null) { const q = ctx.quiz; if (!q || q.answered) return; q.sel = Number(d.opt); $$(".quiz-opt").forEach((b, i) => b.classList.toggle("selected", i === q.sel)); const a = $("#quizAnswer"); if (a) a.disabled = false; return; }
  if ("answer" in d) return answerQuiz();
  if ("next" in d) { const q = ctx.quiz; q.i++; q.sel = null; q.answered = false; render(); return window.scrollTo({ top: 0 }); }
  if (d.career) return selectCareer(d.career, false);
  if (d.careerFilter) { ctx.careerFilter = d.careerFilter; return render(); }
  if (d.day) { ctx.model = null; return go(d.day === "1" ? "dia1" : "dia2"); }
  if (d.model) { ctx.model = d.model; return render(); }
  if ("modelChange" in d) { ctx.model = null; return render(); }
  if (d.save) return saveExam(d.save);
  if ("saveOficina" in d) {
    const v = ($("#oficina").value || "").trim(); if (!v) return toast("Escreva seu texto antes de salvar.");
    if (!user) { toast("Entre ou crie sua conta para guardar na nuvem."); return openAuth("entrar"); }
    saved.unshift({ id: Date.now(), kind: "Oficina de redação", title: "Texto livre", date: new Date().toISOString(), items: [{ label: "Redação", text: v }] }); store.set("saved", saved); paintCloud(); return toast("Texto guardado na nuvem ☁");
  }
  if ("saveQuick" in d) {
    const value = ( $("#quickRepertory")?.value || "" ).trim();
    if (!value) return toast("Escreva seu repertório antes de guardar.");
    const entries = store.get("quickRepertory", []);
    entries.unshift({ id: Date.now(), text: value, date: new Date().toISOString() });
    store.set("quickRepertory", entries);
    $("#quickRepertory").value = "";
    return toast("Exercício guardado neste dispositivo.");
  }
  if (d.delSaved) { saved = saved.filter(s => String(s.id) !== d.delSaved); store.set("saved", saved); paintCloud(); return render(); }
  if ("planEdit" in d) { ctx.planEdit = !ctx.planEdit; return render(); }
  if (d.planDay) return openPlanDay(d.planDay);
  if (d.planChip) return t.classList.toggle("on");
  if (d.planSave) { plan[d.planSave] = $$(".pick-chip.on").map(c => c.dataset.planChip); if (!plan[d.planSave].length) delete plan[d.planSave]; store.set("plan", plan); closeModal(); return render(); }
  if (d.planClear) { delete plan[d.planClear]; store.set("plan", plan); closeModal(); return render(); }
  if (d.saveGoal != null) { const v=Math.max(1,Math.min(80,Number($('#weeklyGoal').value)||15));store.set('weeklyGoal',v);toast('Meta semanal atualizada.');return render(); }
  if (d.saveTarget != null) { const v=Math.max(1,Math.min(100,Number($('#targetPct').value)||75));store.set('targetPct',v);toast('Meta de aproveitamento atualizada.');return render(); }
  if (d.taskDone != null) { const key=d.taskDone;const k=d.taskDone;const day=d.taskDate||dkey(new Date());const full=day+'|'+key;planDone[full]=!planDone[full];store.set('planDone',planDone);return; }
  if (d.saveMinutes != null) { const v=Math.max(0,Math.min(1440,Number($('#studyMinutesInput').value)||0));studyMinutes[dkey(new Date())]=v;store.set('studyMinutes',studyMinutes);checkAchievements();toast('Tempo de estudo registrado.');return render(); }
  if (d.reviewRetry != null) { const r=review[Number(d.reviewRetry)];if(!r)return;ctx.quiz={origin:'review',sid:r.subjectId,ti:null,title:r.title,eyebrow:'REVISÃO · '+String(r.subject).toUpperCase(),items:[{id:r.questionId,text:r.text,options:r.options,answer:r.answer,source:'Sua lista de revisão'}],i:0,sel:null,answered:false,lastOk:false,results:[],startedAt:Date.now()};return go('quiz'); }
  if (d.reviewDone != null) { review.splice(Number(d.reviewDone),1);store.set('review',review);store.set('reviewedCount',store.get('reviewedCount',0)+1);checkAchievements();toast('Questão marcada como revisada.');return render(); }
  if (d.startSim != null) { const sid=$('#simSubject').value,count=Number($('#simCount').value)||10;let items=sid==='all'?SUBJECTS.flatMap(s=>bank(`${s.id}|f1`,8)):bank(`${sid}|f1`,count);items=items.slice(0,count);ctx.quiz={origin:'simulado',sid:sid==='all'?null:sid,ti:null,title:'Simulado',eyebrow:'SIMULADO FUVEST',items,i:0,sel:null,answered:false,lastOk:false,results:[],startedAt:Date.now(),timed:$('#simTimer').checked};return go('quiz'); }
  if (d.addNote != null) { const title=$('#noteTitle').value.trim(),body=$('#noteBody').value.trim();if(!title||!body)return toast('Preencha o título e o conteúdo.');notes.unshift({id:Date.now(),title,body,subject:$('#noteSubject').value,date:new Date().toISOString()});store.set('notes',notes);toast('Anotação salva no caderno.');return render(); }
  if (d.deleteNote != null) {notes=notes.filter(n=>String(n.id)!==d.deleteNote);store.set('notes',notes);return render();}
  if (d.writing) return openWritingExercise(d.writing);
  if (d.finishWriting != null) {const val=$('#writingExerciseText').value.trim();if(!val)return toast('Escreva sua prática antes de salvar.');writingProgress[d.finishWriting]=true;store.set('writingProgress',writingProgress);const arr=store.get('writingEntries',[]);arr.unshift({id:Date.now(),type:d.finishWriting,text:val,date:new Date().toISOString()});store.set('writingEntries',arr);closeModal();toast('Prática salva.');return render();}
  if (d.authTab) return openAuth(d.authTab);
  if ("authSubmit" in d) return submitAuth();
  if ("authClose" in d) return closeAuth();
  if (d.action) return action(d.action);
});
function action(a) {
  if (a === "change-course") { closeModal(); const el = document.createElement("div"); el.id = "coursePicker"; el.className = "course-picker"; document.body.appendChild(el); return showCoursePicker(false); }
  if (a === "login") return openAuth("entrar");
  if (a === "logout") { user = null; store.set("user", null); closeModal(); paintProfile(); if (view === "nuvem") render(); return toast("Você saiu da conta."); }
  if (a === "tour") { closeModal(); return startTour(); }
  if (a === "career-guide") return info("Como funciona", "A 1ª fase é comum a todos. Na 2ª fase, o 1º dia reúne Português e Redação e o 2º dia traz as disciplinas específicas da carreira escolhida.");
  if (a === "new-theme") return info("Novo tema", "O sorteio de temas de FUVESTs anteriores entra junto com o conteúdo.");
  info("Em construção", "Esta funcionalidade será conectada depois.");
}
document.addEventListener("input", e => {
  if (e.target.dataset.qid) { examDrafts[e.target.dataset.qid]=e.target.value; store.set('examDrafts',examDrafts); }
  if (e.target.id === "careerSearch") { ctx.careerSearch = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#careerSearch"); n.focus(); n.setSelectionRange(pos, pos); }
  if (e.target.id === "oficina") { const w = e.target.value.trim().split(/\s+/).filter(Boolean).length; $("#wordCount").textContent = `${w} ${w === 1 ? "PALAVRA" : "PALAVRAS"}`; }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && $("#authScreen") && e.target.closest(".auth-card") && e.target.tagName === "INPUT") { e.preventDefault(); submitAuth(); }
  if (e.key === "Escape") { closeModal(); closeAuth(); if (tourClose) tourClose(); $("#sidebar").classList.remove("open"); $("#mobileOverlay").classList.remove("show"); }
});
$("#modalClose").onclick = closeModal; modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
$("#mobileMenu").onclick = () => { $("#sidebar").classList.add("open"); $("#mobileOverlay").classList.add("show"); };
$("#mobileOverlay").onclick = () => { $("#sidebar").classList.remove("open"); $("#mobileOverlay").classList.remove("show"); };
$("#cloudButton").onclick = () => go("nuvem");
$("#profileButton").onclick = $("#topProfile").onclick = profileModal;

/* ---------- tela de carregamento ---------- */
function runSplash(done) {
  const sp = $("#splash"); if (!sp) return done();
  const msgs = ["Preparando seu espaço…", "Organizando as disciplinas…", "Quase lá…"], el = $("#splashMsg"); let i = 0;
  const iv = setInterval(() => { i = (i + 1) % msgs.length; el.textContent = msgs[i]; }, 900);
  setTimeout(() => { clearInterval(iv); sp.classList.add("leaving"); setTimeout(() => { sp.remove(); done(); }, 520); }, 2700);
}

{ const sb = $("#sidebar"), mm = $("#mobileMenu");
  new MutationObserver(() => { const on = sb.classList.contains("open"); document.body.classList.toggle("lock", on); mm.setAttribute("aria-expanded", on); }).observe(sb, { attributes: true, attributeFilter: ["class"] });
  $("#sidebarClose").onclick = () => { sb.classList.remove("open"); $("#mobileOverlay").classList.remove("show"); };
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sb.classList.contains("open") && !tourClose) $("#sidebarClose").click(); }); }
applyTheme(activeCareer); paintProfile(); paintCloud(); render();
runSplash(() => showCoursePicker(true));
})();
