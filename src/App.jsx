import { useState, useEffect, useRef, useMemo } from "react";
import { supabase, supabaseEnabled, SPACE_ID, TABLE } from "./supabase";

// ---------- seed data ----------
// Módulo 2 vem da planilha; módulos 1 e 3–9 começam vazios, prontos para receber conteúdos.
const seed = () => {
  let id = 0;
  const mk = (modulo, grupo, n, durs = [], done = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: `l${++id}`,
      modulo,
      grupo,
      aula: i + 1,
      duracao: durs[i] ?? null,
      necessario: true,
      completo: i < done,
    }));
  return {
    deadline: null,
    grupos: [
      { modulo: 2, nome: "Psicopatologia", meta: "15/07" },
      { modulo: 2, nome: "Transtornos Psiquiátricos", meta: "" },
      { modulo: 2, nome: "Formulação do Caso Clínico", meta: "" },
      { modulo: 2, nome: "Entrevista Motivacional", meta: "" },
      { modulo: 2, nome: "Monitoramento de Progresso", meta: "" },
    ],
    lessons: [
      ...mk(2, "Psicopatologia", 14, [5, 26, 35, 40, 35, 18, 37, 34, 55, 29, 26, 31, 39, 39], 7),
      ...mk(2, "Transtornos Psiquiátricos", 9, [76, 67, 58, 42, 73, 55, 49, 94, 94]),
      ...mk(2, "Formulação do Caso Clínico", 14),
      ...mk(2, "Entrevista Motivacional", 8),
      ...mk(2, "Monitoramento de Progresso", 12),
    ],
  };
};

const MODULOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STORAGE_KEY = "pos-marina-v2";

const fmtMin = (m) => {
  if (m == null || isNaN(m)) return "—";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h > 0 ? `${h}h${r > 0 ? ` ${r}min` : ""}` : `${r}min`;
};

const daysLeft = (deadline) => {
  if (!deadline) return null;
  const [y, m, d] = deadline.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000) + 1; // inclui hoje
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function PosMarina() {
  const [data, setData] = useState(null);
  const [openMod, setOpenMod] = useState({ 2: true });
  const [openGrp, setOpenGrp] = useState({});
  const [sync, setSync] = useState("idle"); // idle | saving | saved | offline
  const saveTimer = useRef(null);
  const loaded = useRef(false);
  const syncedJson = useRef(null); // último JSON já persistido no servidor

  // envia o estado ao Supabase (upsert da linha única) + espelho no localStorage
  const pushRemote = async (state) => {
    const json = JSON.stringify(state);
    try { localStorage.setItem(STORAGE_KEY, json); } catch (e) { /* cota cheia */ }
    if (!supabaseEnabled) { syncedJson.current = json; setSync("saved"); return; }
    setSync("saving");
    try {
      const { error } = await supabase
        .from(TABLE)
        .upsert({ id: SPACE_ID, state, updated_at: new Date().toISOString() });
      if (error) throw error;
      syncedJson.current = json;
      setSync("saved");
    } catch (e) {
      console.error("save remoto falhou", e);
      setSync("offline");
    }
  };

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      let d = null;
      let rowExisted = false;

      if (supabaseEnabled) {
        try {
          const { data: row, error } = await supabase
            .from(TABLE).select("state").eq("id", SPACE_ID).maybeSingle();
          if (error) throw error;
          if (row?.state) { d = row.state; rowExisted = true; }
        } catch (e) {
          console.error("load remoto falhou", e);
          setSync("offline");
        }
      }

      // fallback / migração: usa o que estiver no localStorage
      if (!d) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) d = JSON.parse(raw);
        } catch (e) { /* sem dados locais */ }
      }

      const initial = d || seed();
      syncedJson.current = JSON.stringify(initial);
      setData(initial);
      setOpenGrp(Object.fromEntries(initial.grupos.map((g) => [`${g.modulo}::${g.nome}`, true])));
      loaded.current = true;

      // se o servidor ainda não tem essa linha, cria com o estado inicial/migrado
      if (supabaseEnabled && !rowExisted) pushRemote(initial);
      else setSync("saved");
    })();
  }, []);

  // ---------- save (debounced) ----------
  useEffect(() => {
    if (!loaded.current || !data) return;
    const json = JSON.stringify(data);
    if (json === syncedJson.current) return; // nada mudou desde o último sync
    setSync("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => pushRemote(data), 700);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  // ---------- re-sync ao voltar o foco (troca de dispositivo) ----------
  useEffect(() => {
    if (!supabaseEnabled) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data: row, error } = await supabase
          .from(TABLE).select("state").eq("id", SPACE_ID).maybeSingle();
        if (error) throw error;
        if (row?.state) {
          const json = JSON.stringify(row.state);
          if (json !== syncedJson.current) {
            syncedJson.current = json;
            setData(row.state); // puxa o progresso feito em outro dispositivo
            setSync("saved");
          }
        }
      } catch (e) { setSync("offline"); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const req = data.lessons.filter((l) => l.necessario);
    const done = req.filter((l) => l.completo);
    const pend = req.filter((l) => !l.completo);
    const pendMin = pend.reduce((s, l) => s + (l.duracao || 0), 0);
    const semDur = pend.filter((l) => l.duracao == null).length;
    const totalMin = req.reduce((s, l) => s + (l.duracao || 0), 0);
    const doneMin = done.reduce((s, l) => s + (l.duracao || 0), 0);
    const dias = daysLeft(data.deadline);
    return {
      total: req.length,
      done: done.length,
      pend: pend.length,
      pendMin,
      semDur,
      pct: req.length ? Math.round((done.length / req.length) * 100) : 0,
      pctMin: totalMin ? Math.round((doneMin / totalMin) * 100) : 0,
      dias,
      porDia: dias && dias > 0 ? Math.ceil(pendMin / dias) : null,
    };
  }, [data]);

  if (!data || !stats) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F1F3EF", fontFamily: "'Public Sans', sans-serif", color: "#5A6B62" }}>
        Carregando o portal…
      </div>
    );
  }

  const update = (fn) => setData((d) => fn(structuredClone(d)));

  const toggleLesson = (id) =>
    update((d) => { const l = d.lessons.find((x) => x.id === id); l.completo = !l.completo; return d; });

  const setDur = (id, v) =>
    update((d) => {
      const l = d.lessons.find((x) => x.id === id);
      const n = parseInt(v, 10);
      l.duracao = isNaN(n) || n <= 0 ? null : n;
      return d;
    });

  const toggleNec = (id) =>
    update((d) => { const l = d.lessons.find((x) => x.id === id); l.necessario = !l.necessario; return d; });

  const addAula = (modulo, grupo) =>
    update((d) => {
      const n = d.lessons.filter((l) => l.modulo === modulo && l.grupo === grupo).length + 1;
      d.lessons.push({ id: `l${Date.now()}`, modulo, grupo, aula: n, duracao: null, necessario: true, completo: false });
      return d;
    });

  const removeAula = (id) =>
    update((d) => { d.lessons = d.lessons.filter((l) => l.id !== id); return d; });

  const setMeta = (modulo, nome, v) =>
    update((d) => { d.grupos.find((g) => g.modulo === modulo && g.nome === nome).meta = v; return d; });

  const addGrupo = (modulo) => {
    const nome = prompt(`Nome do novo conteúdo do Módulo ${modulo}:`);
    if (!nome?.trim()) return;
    const clean = nome.trim();
    update((d) => {
      if (d.grupos.some((g) => g.modulo === modulo && g.nome === clean)) return d;
      d.grupos.push({ modulo, nome: clean, meta: "" });
      return d;
    });
    setOpenGrp((o) => ({ ...o, [`${modulo}::${clean}`]: true }));
    setOpenMod((o) => ({ ...o, [modulo]: true }));
  };

  const removeGrupo = (modulo, nome) => {
    if (!confirm(`Remover o conteúdo "${nome}" e todas as suas aulas?`)) return;
    update((d) => {
      d.grupos = d.grupos.filter((g) => !(g.modulo === modulo && g.nome === nome));
      d.lessons = d.lessons.filter((l) => !(l.modulo === modulo && l.grupo === nome));
      return d;
    });
  };

  const resetSeed = async () => {
    if (!confirm("Restaurar os dados originais da planilha? Todo o progresso registrado aqui será substituído.")) return;
    const s = seed();
    s.deadline = data.deadline;
    setData(s);
    setOpenMod({ 2: true });
    setOpenGrp(Object.fromEntries(s.grupos.map((g) => [`${g.modulo}::${g.nome}`, true])));
  };

  const urgente = stats.dias != null && stats.porDia != null && stats.porDia > 120;
  const vencido = stats.dias != null && stats.dias <= 0 && stats.pend > 0;

  return (
    <div className="pm-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Public+Sans:wght@400;500;600;700&display=swap');
        .pm-root { min-height: 100vh; background: #F1F3EF; color: #1C2924; font-family: 'Public Sans', system-ui, sans-serif; padding: 28px 16px 64px; }
        .pm-wrap { max-width: 880px; margin: 0 auto; }
        .pm-eyebrow { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #5A6B62; font-weight: 600; }
        .pm-title { font-family: 'Newsreader', serif; font-weight: 500; font-size: clamp(30px, 5vw, 42px); line-height: 1.05; margin: 6px 0 0; }
        .pm-title em { font-style: italic; color: #2E6B4F; }
        .pm-band { background: #1C2924; color: #EDF2EE; border-radius: 14px; padding: 22px 24px; margin-top: 22px; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; justify-content: space-between; }
        .pm-dose-num { font-family: 'Newsreader', serif; font-size: clamp(40px, 7vw, 58px); line-height: 1; font-weight: 500; }
        .pm-dose-num.amber { color: #E9A55C; }
        .pm-dose-lbl { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #9DB3A6; margin-top: 6px; font-weight: 600; }
        .pm-band-right { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
        .pm-facts { display: flex; gap: 22px; flex-wrap: wrap; }
        .pm-fact b { display: block; font-size: 19px; font-weight: 600; color: #EDF2EE; }
        .pm-fact span { font-size: 11px; color: #9DB3A6; letter-spacing: .06em; text-transform: uppercase; }
        .pm-daystrip { display: flex; gap: 3px; flex-wrap: wrap; max-width: 320px; justify-content: flex-end; }
        .pm-day { width: 8px; height: 14px; border-radius: 2px; background: #33473E; }
        .pm-day.hot { background: #E9A55C; }
        .pm-deadline { margin-top: 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .pm-deadline label { font-size: 13px; font-weight: 600; color: #3D4F46; }
        .pm-deadline input[type="date"] { border: 1px solid #C6D0C6; border-radius: 8px; padding: 7px 10px; font: inherit; font-size: 14px; background: #fff; color: inherit; }
        .pm-warn { font-size: 13px; color: #B4691E; font-weight: 500; }
        .pm-progress { margin-top: 18px; background: #fff; border: 1px solid #DFE5DE; border-radius: 12px; padding: 16px 18px; }
        .pm-bar { height: 10px; border-radius: 6px; background: #E4E9E2; overflow: hidden; margin-top: 8px; }
        .pm-bar > div { height: 100%; background: #2E6B4F; border-radius: 6px; transition: width .4s ease; }
        .pm-progress-row { display: flex; justify-content: space-between; font-size: 13px; color: #5A6B62; }
        .pm-progress-row b { color: #1C2924; }

        .pm-mod { margin-top: 26px; }
        .pm-mhead { display: flex; align-items: baseline; gap: 14px; cursor: pointer; user-select: none; padding: 4px 2px; border-bottom: 2px solid #1C2924; }
        .pm-mnum { font-family: 'Newsreader', serif; font-style: italic; font-size: 15px; color: #5A6B62; }
        .pm-mname { font-family: 'Newsreader', serif; font-size: 24px; font-weight: 600; flex: 1; }
        .pm-mstats { font-size: 12px; color: #5A6B62; white-space: nowrap; }
        .pm-mstats b { color: #1C2924; }
        .pm-mchev { color: #9DB3A6; font-size: 12px; transition: transform .2s; align-self: center; }
        .pm-mchev.open { transform: rotate(90deg); }
        .pm-mempty { font-size: 13px; color: #8A9A90; padding: 12px 2px 0; font-style: italic; }

        .pm-group { background: #fff; border: 1px solid #DFE5DE; border-radius: 12px; margin-top: 12px; overflow: hidden; }
        .pm-ghead { display: flex; align-items: center; gap: 12px; padding: 13px 16px; cursor: pointer; user-select: none; }
        .pm-ghead:hover { background: #F7F9F6; }
        .pm-gname { font-family: 'Newsreader', serif; font-size: 19px; font-weight: 500; flex: 1; min-width: 0; }
        .pm-gcount { font-size: 12px; color: #5A6B62; white-space: nowrap; }
        .pm-gbar { width: 90px; height: 6px; border-radius: 4px; background: #E4E9E2; overflow: hidden; }
        .pm-gbar > div { height: 100%; background: #2E6B4F; }
        .pm-chev { color: #9DB3A6; font-size: 12px; transition: transform .2s; }
        .pm-chev.open { transform: rotate(90deg); }
        .pm-meta { font-size: 11px; color: #5A6B62; border: 1px dashed #C6D0C6; border-radius: 6px; padding: 3px 8px; width: 74px; text-align: center; background: transparent; font-family: inherit; }
        .pm-meta::placeholder { color: #A8B5AC; }
        .pm-rows { border-top: 1px solid #EDF1EC; }
        .pm-row { display: flex; align-items: center; gap: 12px; padding: 9px 16px; border-bottom: 1px solid #F2F5F1; font-size: 14px; }
        .pm-row:last-child { border-bottom: none; }
        .pm-row.done { color: #8A9A90; }
        .pm-row.done .pm-aula { text-decoration: line-through; text-decoration-color: #B9C6BC; }
        .pm-row.skip { opacity: .5; }
        .pm-check { width: 19px; height: 19px; accent-color: #2E6B4F; cursor: pointer; flex-shrink: 0; }
        .pm-aula { flex: 1; min-width: 0; }
        .pm-dur { width: 58px; border: 1px solid transparent; border-radius: 6px; padding: 4px 6px; text-align: right; font: inherit; font-size: 13px; background: transparent; color: inherit; }
        .pm-dur:hover, .pm-dur:focus { border-color: #C6D0C6; background: #fff; outline: none; }
        .pm-dur.missing { border-color: #E9CBA6; background: #FBF4E9; }
        .pm-durlbl { font-size: 11px; color: #9DB3A6; width: 26px; }
        .pm-nec { font-size: 10.5px; letter-spacing: .05em; border: 1px solid #DFE5DE; border-radius: 20px; padding: 2px 9px; background: none; cursor: pointer; color: #5A6B62; font-family: inherit; }
        .pm-nec.on { background: #EAF1EC; border-color: #BFD4C6; color: #2E6B4F; font-weight: 600; }
        .pm-x { border: none; background: none; color: #C4CFC7; cursor: pointer; font-size: 15px; padding: 2px 4px; }
        .pm-x:hover { color: #B4691E; }
        .pm-gx { border: none; background: none; color: #C4CFC7; cursor: pointer; font-size: 14px; padding: 2px 4px; flex-shrink: 0; }
        .pm-gx:hover { color: #B4691E; }
        .pm-add { display: block; width: 100%; border: none; background: #F7F9F6; color: #2E6B4F; font: inherit; font-size: 13px; font-weight: 600; padding: 10px; cursor: pointer; }
        .pm-add:hover { background: #EFF4EF; }
        .pm-addgroup { margin-top: 12px; width: 100%; border: 1px dashed #C6D0C6; background: none; border-radius: 12px; padding: 10px; font: inherit; font-size: 13px; font-weight: 600; color: #5A6B62; cursor: pointer; }
        .pm-addgroup:hover { border-color: #2E6B4F; color: #2E6B4F; }
        .pm-foot { margin-top: 30px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #8A9A90; flex-wrap: wrap; gap: 10px; }
        .pm-foot button { border: none; background: none; color: #8A9A90; text-decoration: underline; cursor: pointer; font: inherit; font-size: 12px; }
        .pm-foot button:hover { color: #B4691E; }
        @media (prefers-reduced-motion: reduce) { .pm-bar > div, .pm-chev, .pm-mchev { transition: none; } }
      `}</style>

      <div className="pm-wrap">
        <div className="pm-eyebrow">Pós-graduação · 9 módulos</div>
        <h1 className="pm-title">Portal de estudos da <em>Marina</em></h1>

        {/* ---------- ritmo band ---------- */}
        <div className="pm-band">
          <div>
            <div className={`pm-dose-num ${urgente || vencido ? "amber" : ""}`}>
              {vencido ? "Prazo vencido" : stats.porDia != null ? `${stats.porDia} min/dia` : "—"}
            </div>
            <div className="pm-dose-lbl">
              {data.deadline
                ? `ritmo necessário até ${fmtDate(data.deadline)}`
                : "defina o prazo final abaixo para calcular o ritmo"}
            </div>
          </div>
          <div className="pm-band-right">
            <div className="pm-facts">
              <div className="pm-fact"><b>{stats.pend}</b><span>aulas restantes</span></div>
              <div className="pm-fact"><b>{fmtMin(stats.pendMin)}</b><span>tempo restante</span></div>
              <div className="pm-fact"><b>{stats.dias != null ? Math.max(stats.dias, 0) : "—"}</b><span>dias até o prazo</span></div>
            </div>
            {stats.dias != null && stats.dias > 0 && stats.dias <= 90 && (
              <div className="pm-daystrip" aria-hidden="true">
                {Array.from({ length: stats.dias }, (_, i) => (
                  <div key={i} className={`pm-day ${i < 7 ? "hot" : ""}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pm-deadline">
          <label htmlFor="pm-dl">Prazo final:</label>
          <input
            id="pm-dl"
            type="date"
            value={data.deadline || ""}
            onChange={(e) => update((d) => { d.deadline = e.target.value || null; return d; })}
          />
          {stats.semDur > 0 && (
            <span className="pm-warn">
              ⚠ {stats.semDur} aula{stats.semDur > 1 ? "s" : ""} sem duração — o ritmo real será maior. Preencha os minutos abaixo.
            </span>
          )}
        </div>

        {/* ---------- overall progress ---------- */}
        <div className="pm-progress">
          <div className="pm-progress-row">
            <span><b>{stats.done}</b> de <b>{stats.total}</b> aulas concluídas</span>
            <span><b>{stats.pct}%</b> das aulas · <b>{stats.pctMin}%</b> do tempo mapeado</span>
          </div>
          <div className="pm-bar"><div style={{ width: `${stats.pct}%` }} /></div>
        </div>

        {/* ---------- módulos ---------- */}
        {MODULOS.map((mod) => {
          const grupos = data.grupos.filter((g) => g.modulo === mod);
          const modLessons = data.lessons.filter((l) => l.modulo === mod && l.necessario);
          const modDone = modLessons.filter((l) => l.completo).length;
          const modMin = modLessons.filter((l) => !l.completo).reduce((s, l) => s + (l.duracao || 0), 0);
          const isOpen = !!openMod[mod];
          return (
            <section className="pm-mod" key={mod}>
              <div className="pm-mhead" onClick={() => setOpenMod((o) => ({ ...o, [mod]: !o[mod] }))}>
                <span className={`pm-mchev ${isOpen ? "open" : ""}`}>▶</span>
                <span className="pm-mnum">módulo</span>
                <span className="pm-mname">{mod}</span>
                <span className="pm-mstats">
                  {modLessons.length > 0
                    ? <><b>{modDone}/{modLessons.length}</b> aulas{modMin > 0 && <> · {fmtMin(modMin)} restantes</>}</>
                    : "sem conteúdos ainda"}
                </span>
              </div>

              {isOpen && (
                <>
                  {grupos.length === 0 && (
                    <div className="pm-mempty">Nenhum conteúdo cadastrado neste módulo.</div>
                  )}
                  {grupos.map((g) => {
                    const key = `${mod}::${g.nome}`;
                    const ls = data.lessons.filter((l) => l.modulo === mod && l.grupo === g.nome);
                    const req = ls.filter((l) => l.necessario);
                    const done = req.filter((l) => l.completo).length;
                    const pct = req.length ? Math.round((done / req.length) * 100) : 0;
                    const gOpen = !!openGrp[key];
                    return (
                      <div className="pm-group" key={key}>
                        <div className="pm-ghead" onClick={() => setOpenGrp((o) => ({ ...o, [key]: !o[key] }))}>
                          <span className={`pm-chev ${gOpen ? "open" : ""}`}>▶</span>
                          <span className="pm-gname">{g.nome}</span>
                          <input
                            className="pm-meta"
                            value={g.meta}
                            placeholder="meta (dd/mm)"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setMeta(mod, g.nome, e.target.value)}
                            aria-label={`Data-meta para ${g.nome}`}
                          />
                          <span className="pm-gcount">{done}/{req.length}</span>
                          <span className="pm-gbar"><div style={{ width: `${pct}%` }} /></span>
                          <button
                            className="pm-gx"
                            title="Remover conteúdo"
                            onClick={(e) => { e.stopPropagation(); removeGrupo(mod, g.nome); }}
                          >✕</button>
                        </div>
                        {gOpen && (
                          <div className="pm-rows">
                            {ls.map((l) => (
                              <div key={l.id} className={`pm-row ${l.completo ? "done" : ""} ${!l.necessario ? "skip" : ""}`}>
                                <input
                                  type="checkbox"
                                  className="pm-check"
                                  checked={l.completo}
                                  onChange={() => toggleLesson(l.id)}
                                  aria-label={`Aula ${l.aula} de ${g.nome}`}
                                />
                                <span className="pm-aula">Aula {l.aula}</span>
                                <input
                                  className={`pm-dur ${l.duracao == null ? "missing" : ""}`}
                                  value={l.duracao ?? ""}
                                  placeholder="min?"
                                  inputMode="numeric"
                                  onChange={(e) => setDur(l.id, e.target.value)}
                                  aria-label="Duração em minutos"
                                />
                                <span className="pm-durlbl">min</span>
                                <button
                                  className={`pm-nec ${l.necessario ? "on" : ""}`}
                                  onClick={() => toggleNec(l.id)}
                                  title="Necessário assistir?"
                                >
                                  {l.necessario ? "necessária" : "opcional"}
                                </button>
                                <button className="pm-x" onClick={() => removeAula(l.id)} title="Remover aula">✕</button>
                              </div>
                            ))}
                            <button className="pm-add" onClick={() => addAula(mod, g.nome)}>+ adicionar aula</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button className="pm-addgroup" onClick={() => addGrupo(mod)}>
                    + novo conteúdo no módulo {mod}
                  </button>
                </>
              )}
            </section>
          );
        })}

        <div className="pm-foot">
          <span>
            {sync === "saving" && "Sincronizando…"}
            {sync === "saved" && (supabaseEnabled ? "Sincronizado em todos os dispositivos" : "Salvo neste navegador")}
            {sync === "offline" && "⚠ Sem conexão — salvo localmente, sincroniza ao reconectar"}
            {sync === "idle" && "Carregando…"}
          </span>
          <button onClick={resetSeed}>restaurar dados da planilha</button>
        </div>
      </div>
    </div>
  );
}
