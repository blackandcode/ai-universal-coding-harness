import fs from 'node:fs';
import React, { useEffect, useReducer, useState } from 'react';
import { render, Box, Text, useInput, useStdout } from 'ink';
import { EventEmitter } from 'node:events';
import type { UiEvent } from '../types.js';
import { dashboardLayout } from './layout.js';
const h = React.createElement;
const PHASES = ['PLAN', 'IMPLEMENT', 'QUALITY', 'REVIEW', 'COMMIT'];
const one = (s = '') => String(s).replace(/\s+/g, ' ').trim();
const trunc = (s = '', n = 120) => {
  const x = one(s);
  return x.length > n ? x.slice(0, Math.max(0, n - 1)) + '…' : x;
};
const icon = (s: string) =>
  ['completed', 'approved', 'pass'].includes(s)
    ? '✓'
    : ['failed', 'blocked', 'deny', 'error'].includes(s)
      ? '✗'
      : ['active', 'in_progress', 'started', 'pending'].includes(s)
        ? '◐'
        : '○';
const color = (s: string) =>
  ['completed', 'approved', 'pass'].includes(s)
    ? 'green'
    : ['failed', 'blocked', 'deny', 'error'].includes(s)
      ? 'red'
      : ['active', 'in_progress', 'started'].includes(s)
        ? 'cyan'
        : 'gray';
function init(meta: any) {
  return {
    meta,
    status: meta.status || 'starting',
    phase: Object.fromEntries(PHASES.map((x) => [x, 'pending'])),
    currentStage: '',
    stageIndex: 0,
    stageTotal: meta.stageTotal || 0,
    attempt: 0,
    messages: [],
    tools: {},
    toolOrder: [],
    toolCounts: {},
    todos: [],
    quality: null,
    changedFiles: [],
    tokens: { calls: 0, input: 0, output: 0 },
    logs: [],
    focusText: '',
    focusFile: '',
  };
}
function msg(state: any, item: any) {
  return {
    ...state,
    messages: [...state.messages, { ...item, id: `${Date.now()}-${Math.random()}` }].slice(-40),
  };
}
export function reducer(state: any, e: UiEvent) {
  const p = e.payload || {};
  switch (e.type) {
    case 'run.started':
      return { ...state, status: 'running', meta: { ...state.meta, ...p } };
    case 'run.completed':
      return msg(
        {
          ...state,
          status: 'completed',
          phase: Object.fromEntries(PHASES.map((x) => [x, 'completed'])),
        },
        { role: 'system', text: 'Run completed.' },
      );
    case 'run.blocked':
      return msg(
        { ...state, status: p.status || 'failed' },
        { role: 'system', kind: 'error', text: p.reason || 'Run stopped' },
      );
    case 'stage.started':
      return {
        ...state,
        currentStage: p.stage || '',
        stageIndex: p.index || 0,
        stageTotal: p.total || state.stageTotal,
        attempt: 0,
        phase: {
          PLAN: 'active',
          IMPLEMENT: 'pending',
          QUALITY: 'pending',
          REVIEW: 'pending',
          COMMIT: 'pending',
        },
        quality: null,
        changedFiles: [],
        todos: [],
        tools: {},
        toolOrder: [],
        toolCounts: {},
        focusText: '',
        focusFile: '',
      };
    case 'stage.attempt':
      return {
        ...state,
        attempt: p.attempt || 0,
        phase: {
          ...state.phase,
          PLAN: 'completed',
          IMPLEMENT: 'active',
          QUALITY: 'pending',
          REVIEW: 'pending',
          COMMIT: 'pending',
        },
      };
    case 'executor.mode': {
      const ph = { ...state.phase };
      if (p.mode === 'plan') ph.PLAN = 'active';
      if (p.mode === 'agent') {
        ph.PLAN = 'completed';
        ph.IMPLEMENT = 'active';
      }
      return { ...state, phase: ph };
    }
    case 'executor.focus.delta':
      return {
        ...state,
        focusText: (state.focusText + String(p.text || '')).slice(-200000),
        focusFile: p.focus_file || state.focusFile,
      };
    case 'executor.message':
      return msg(state, { role: 'executor', text: p.text || '' });
    case 'reviewer.plan':
      return msg(
        {
          ...state,
          phase: {
            ...state.phase,
            PLAN: String(p.verdict || '').startsWith('APPROVE') ? 'completed' : 'active',
          },
        },
        { role: 'reviewer', text: `Plan ${p.verdict}: ${p.summary || p.feedback || ''}` },
      );
    case 'executor.question':
      return msg(state, { role: 'executor', text: `Question: ${p.prompt || p.title || ''}` });
    case 'reviewer.question':
      return msg(state, {
        role: 'reviewer',
        text: `Answer: ${p.answer || ''}${p.rationale ? ` — ${p.rationale}` : ''}`,
      });
    case 'executor.permission':
      return msg(state, { role: 'system', text: `Permission requested: ${p.summary || ''}` });
    case 'reviewer.permission':
      return msg(state, { role: 'reviewer', text: `Permission ${p.verdict}: ${p.summary || ''}` });
    case 'executor.todos': {
      const incoming = Array.isArray(p.todos) ? p.todos : [];
      if (!p.merge) return { ...state, todos: incoming };
      const by: any = new Map(state.todos.map((x: any) => [x.id, x]));
      for (const x of incoming) by.set(x.id, { ...(by.get(x.id) || {}), ...x });
      return { ...state, todos: [...by.values()] };
    }
    case 'executor.tool': {
      const id = p.id || p.toolCallId || String(Date.now());
      const prev = state.tools[id] || {};
      const tools = { ...state.tools, [id]: { ...prev, ...p } };
      const order = state.toolOrder.includes(id)
        ? state.toolOrder
        : [...state.toolOrder, id].slice(-60);
      return { ...state, tools, toolOrder: order };
    }
    case 'quality.started':
      return { ...state, phase: { ...state.phase, IMPLEMENT: 'completed', QUALITY: 'active' } };
    case 'quality.result': {
      const pass = p.status === 'PASS' || p.pass === true;
      return msg(
        {
          ...state,
          phase: { ...state.phase, IMPLEMENT: 'completed', QUALITY: pass ? 'completed' : 'active' },
          quality: p,
          changedFiles: p.changed_files || state.changedFiles,
        },
        {
          role: 'system',
          kind: pass ? 'success' : 'error',
          text: `Quality ${pass ? 'PASS' : 'FAIL'}: ${p.summary || p.quality_summary || ''}`,
        },
      );
    }
    case 'review.started':
      return { ...state, phase: { ...state.phase, REVIEW: 'active' } };
    case 'review.result':
      return msg(
        {
          ...state,
          phase: { ...state.phase, REVIEW: p.verdict === 'APPROVE' ? 'completed' : 'active' },
        },
        { role: 'reviewer', text: `Final review ${p.verdict}: ${p.summary || ''}` },
      );
    case 'commit.started':
      return { ...state, phase: { ...state.phase, COMMIT: 'active' } };
    case 'stage.committed':
      return msg(
        { ...state, phase: { ...state.phase, COMMIT: 'completed' } },
        {
          role: 'system',
          text: `Committed ${p.stage || ''} · ${String(p.sha || '').slice(0, 12)}`,
        },
      );
    case 'reviewer.tokens':
      return {
        ...state,
        tokens: {
          calls: state.tokens.calls + 1,
          input: state.tokens.input + Number(p.input || 0),
          output: state.tokens.output + Number(p.output || 0),
        },
      };
    case 'log':
      return { ...state, logs: [...state.logs, { ts: e.ts, ...p }].slice(-100) };
    default:
      return state;
  }
}
function wrap(text: string, width: number) {
  const out: string[] = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw) {
      out.push('');
      continue;
    }
    let s = raw;
    while (s.length > width) {
      let i = s.lastIndexOf(' ', width);
      if (i < width * 0.45) i = width;
      out.push(s.slice(0, i));
      s = s.slice(i).trimStart();
    }
    out.push(s);
  }
  return out;
}
function focusText(state: any) {
  try {
    if (state.focusFile && fs.existsSync(state.focusFile))
      return fs.readFileSync(state.focusFile, 'utf8');
  } catch {}
  return state.focusText || '';
}
function Header({ state, height, width }: any) {
  const c = state.status === 'completed' ? 'green' : state.status === 'running' ? 'cyan' : 'red';
  const done = PHASES.filter((x) => state.phase[x] === 'completed').length;
  const active = PHASES.some((x) => state.phase[x] === 'active') ? 0.45 : 0;
  const ratio = Math.max(0, Math.min(1, (done + active) / PHASES.length));
  const n = Math.max(10, Math.min(36, width - 14));
  const fill = Math.round(n * ratio);
  return h(
    Box,
    { height, borderStyle: 'round', borderColor: c, paddingX: 1, flexDirection: 'column' },
    h(
      Box,
      { justifyContent: 'space-between' },
      h(Text, { bold: true, color: c }, 'AI Universal Coding Harness'),
      h(Text, { color: 'gray' }, state.status),
    ),
    h(Text, null, `Branch: ${trunc(state.meta.branch || '—', Math.max(20, width - 14))}`),
    h(
      Text,
      null,
      trunc(
        `Stage: ${state.currentStage ? `${state.stageIndex}/${state.stageTotal} ${state.currentStage}` : 'Preparing run'}${state.attempt ? ` · Attempt ${state.attempt}` : ''}`,
        width - 8,
      ),
    ),
    height >= 7
      ? h(
          Text,
          { color: 'gray' },
          `⚡ ${state.meta.executorLabel || 'executor'} · 🧠 ${state.meta.reviewerLabel || 'reviewer'}`,
        )
      : null,
    height >= 7
      ? h(
          Box,
          { gap: 1 },
          ...PHASES.map((x) =>
            h(Text, { key: x, color: color(state.phase[x]) }, `${icon(state.phase[x])} ${x}`),
          ),
        )
      : null,
    h(
      Text,
      null,
      h(Text, { color: 'green' }, '█'.repeat(fill)),
      h(Text, { color: 'gray' }, '░'.repeat(n - fill)),
      ` ${Math.round(ratio * 100)}%`,
    ),
  );
}
function FocusPreview({ state, height, width }: any) {
  const lines = wrap(
    state.focusText || '(Awaiting executor focus/progress…)',
    Math.max(20, width - 8),
  );
  const show = lines.slice(-Math.max(1, height - 2));
  while (show.length < height - 2) show.unshift('');
  return h(
    Box,
    { height, borderStyle: 'round', borderColor: 'yellow', paddingX: 1, flexDirection: 'column' },
    h(Text, { color: 'yellow', bold: true }, 'Agent Focus'),
    ...show.map((x, i) => h(Text, { key: i }, x)),
  );
}
function MainBody({ state, height, width }: any) {
  const msgs = state.messages.slice(-2);
  const tools = state.toolOrder.map((id: string) => state.tools[id]).filter(Boolean);
  const active = tools.filter((x: any) =>
    ['pending', 'in_progress', 'active', 'started'].includes(x.status),
  );
  const recent = [
    ...active.slice(0, 2),
    ...tools.filter((x: any) => !active.includes(x)).slice(-Math.max(0, 3 - active.length)),
  ].slice(0, 3);
  const rows: any[] = [];
  for (const m of msgs)
    rows.push(
      h(
        Text,
        {
          key: m.id,
          color:
            m.role === 'reviewer'
              ? 'magenta'
              : m.role === 'executor'
                ? 'cyan'
                : m.kind === 'error'
                  ? 'red'
                  : 'gray',
        },
        `${m.role === 'reviewer' ? '🧠' : m.role === 'executor' ? '⚡' : '◆'} ${trunc(m.text, width - 5)}`,
      ),
    );
  for (const t of recent)
    rows.push(
      h(
        Text,
        {
          key: t.id,
          color: ['failed', 'error'].includes(t.status)
            ? 'red'
            : ['pending', 'in_progress', 'active', 'started'].includes(t.status)
              ? 'cyan'
              : 'gray',
        },
        `${['pending', 'in_progress', 'active', 'started'].includes(t.status) ? '◐' : t.status === 'completed' ? '✓' : '✗'} ${trunc(`${t.title || 'Tool'}${t.detail ? ` · ${t.detail}` : ''}`, width - 5)}`,
      ),
    );
  if (state.quality)
    rows.push(
      h(
        Text,
        { key: 'quality', color: state.quality.status === 'PASS' ? 'green' : 'red' },
        `${state.quality.status === 'PASS' ? '✓' : '✗'} Quality ${state.quality.status} · ${trunc(state.quality.quality_summary || state.quality.summary || '', width - 28)}`,
      ),
    );
  while (rows.length < height) rows.push(h(Text, { key: `blank-${rows.length}` }, ''));
  return h(Box, { height, flexDirection: 'column' }, ...rows.slice(0, height));
}
function ListPanel({ title, lines, height }: any) {
  const body = lines.slice(0, Math.max(1, height - 3));
  while (body.length < height - 3) body.push('');
  return h(
    Box,
    { height, flexDirection: 'column', paddingX: 1 },
    h(Text, { bold: true, color: 'cyan' }, title),
    h(
      Box,
      { height: height - 2, borderStyle: 'round', paddingX: 1, flexDirection: 'column' },
      ...body.map((x: string, i: number) => h(Text, { key: i }, x)),
    ),
    h(Text, { color: 'gray' }, 'Esc return'),
  );
}
export function App({ emitter, meta, initialEvents = [] }: any) {
  const [state, dispatch] = useReducer(reducer, init(meta));
  const [panel, setPanel] = useState('main');
  const [quiet, setQuiet] = useState(false);
  const [focusOffset, setFocusOffset] = useState(0);
  const [follow, setFollow] = useState(true);
  const { stdout } = useStdout();
  useEffect(() => {
    for (const e of initialEvents) dispatch(e);
    const fn = (e: any) => dispatch(e);
    emitter.on('event', fn);
    return () => emitter.off('event', fn);
  }, [emitter]);
  const rows = stdout?.rows || 24,
    width = stdout?.columns || 120,
    layout = dashboardLayout(rows, meta.dashboardMaxRows || 26);
  const H = layout.maxRows,
    minimal = layout.mode === 'minimal',
    _normal = layout.mode === 'normal';
  useInput((input: any, key: any) => {
    if (key.ctrl && input === 'c') {
      process.kill(process.pid, 'SIGINT');
      return;
    }
    if (input === 'f') {
      setPanel(panel === 'focus' ? 'main' : 'focus');
      setFollow(true);
      setFocusOffset(0);
    }
    if (input === 't') setPanel(panel === 'todos' ? 'main' : 'todos');
    if (input === 'd') setPanel(panel === 'changes' ? 'main' : 'changes');
    if (input === 'l') setPanel(panel === 'logs' ? 'main' : 'logs');
    if (input === 'q') setQuiet((x) => !x);
    if (key.escape) setPanel('main');
    if (panel === 'focus') {
      if (key.upArrow) {
        setFollow(false);
        setFocusOffset((x) => x + 1);
      }
      if (key.downArrow) setFocusOffset((x) => Math.max(0, x - 1));
      if (key.pageUp) {
        setFollow(false);
        setFocusOffset((x) => x + Math.max(3, H - 5));
      }
      if (key.pageDown) setFocusOffset((x) => Math.max(0, x - Math.max(3, H - 5)));
      if (key.end) {
        setFollow(true);
        setFocusOffset(0);
      }
      if (key.home) {
        setFollow(false);
        setFocusOffset(999999);
      }
    }
  });
  if (quiet)
    return h(
      Box,
      { height: H, paddingX: 1 },
      h(
        Text,
        { color: 'cyan' },
        `${icon('active')} ${state.currentStage || state.status} · q restore`,
      ),
    );
  if (panel === 'focus') {
    const lines = wrap(focusText(state), Math.max(20, width - 4)),
      viewport = Math.max(3, H - 4),
      off = follow ? 0 : focusOffset,
      start = Math.max(0, lines.length - viewport - off),
      visible = lines.slice(start, start + viewport);
    while (visible.length < viewport) visible.push('');
    return h(
      Box,
      { height: H, flexDirection: 'column', paddingX: 1 },
      h(
        Box,
        { height: 2, justifyContent: 'space-between' },
        h(Text, { bold: true, color: 'yellow' }, 'Agent Focus · full stream'),
        h(Text, { color: 'gray' }, follow ? 'following' : 'paused'),
      ),
      h(
        Box,
        { height: viewport, borderStyle: 'round', paddingX: 1, flexDirection: 'column' },
        ...visible.map((x, i) => h(Text, { key: i }, x)),
      ),
      h(Text, { color: 'gray' }, '↑↓ scroll · PgUp/PgDn · Home/End · f/Esc main'),
    );
  }
  if (panel === 'todos')
    return h(ListPanel, {
      title: 'Todos',
      height: H,
      lines: state.todos.map(
        (x: any) =>
          `${x.status === 'completed' ? '✓' : x.status === 'in_progress' ? '◐' : '○'} ${x.content || x.title || x.id}`,
      ),
    });
  if (panel === 'changes')
    return h(ListPanel, {
      title: 'Changed Files',
      height: H,
      lines: state.changedFiles.length ? state.changedFiles : ['(No changed-file evidence yet)'],
    });
  if (panel === 'logs')
    return h(ListPanel, {
      title: 'Recent Logs',
      height: H,
      lines: state.logs.map((x: any) => `${x.level || 'info'} · ${one(x.message || '')}`).slice(-H),
    });
  const headerH = Math.min(layout.headerRows, H - 1),
    focusH = Math.min(layout.focusRows, Math.max(0, H - headerH - layout.footerRows)),
    taskH = Math.min(layout.taskRows, Math.max(0, H - headerH - focusH - layout.footerRows)),
    footerH = layout.footerRows,
    bodyH = Math.max(1, H - headerH - focusH - taskH - footerH);
  const task =
    state.todos.find((x: any) => x.status === 'in_progress') ||
    state.todos.find((x: any) => x.status === 'pending');
  const done = state.todos.filter((x: any) => x.status === 'completed').length,
    total = state.todos.filter((x: any) => x.status !== 'cancelled').length;
  return h(
    Box,
    { height: H, flexDirection: 'column', paddingX: 1 },
    h(Header, { state, height: headerH, width }),
    h(FocusPreview, { state, height: focusH, width }),
    taskH
      ? h(
          Box,
          { height: taskH },
          h(
            Text,
            { color: task ? 'cyan' : 'gray' },
            task
              ? `▶ ${trunc(task.content || task.title || '', width - 24)} (${done}/${total})`
              : total
                ? `✓ Todos ${done}/${total}`
                : '· No active todo',
          ),
        )
      : null,
    h(MainBody, { state, height: bodyH, width }),
    h(
      Box,
      { height: footerH, justifyContent: 'space-between' },
      h(
        Text,
        { color: 'gray' },
        minimal ? 'f focus · q quiet' : 'f focus · t todos · d changes · l logs · q quiet',
      ),
      h(Text, { color: 'gray' }, `Reviewer calls ${state.tokens.calls}`),
    ),
  );
}
function readEvents(file: string, maxBytes = 256 * 1024) {
  if (!fs.existsSync(file)) return [];
  try {
    const st = fs.statSync(file),
      start = Math.max(0, st.size - maxBytes),
      fd = fs.openSync(file, 'r'),
      buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    let txt = buf.toString('utf8');
    if (start > 0) {
      const nl = txt.indexOf('\n');
      if (nl >= 0) txt = txt.slice(nl + 1);
    }
    return txt
      .split(/\r?\n/)
      .filter(Boolean)
      .map((x) => {
        try {
          return JSON.parse(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-500);
  } catch {
    return [];
  }
}
export async function startInkUi(opts: { emitter: EventEmitter; eventFile: string; meta: any }) {
  const previous = readEvents(opts.eventFile);
  const app = render(h(App, { emitter: opts.emitter, meta: opts.meta, initialEvents: previous }), {
    exitOnCtrlC: false,
  });
  return {
    close() {
      try {
        app.unmount();
      } catch {}
    },
  };
}
export async function followInkUi(opts: { eventFile: string; meta: any }) {
  const emitter = new EventEmitter();
  const previous = readEvents(opts.eventFile);
  const app = render(h(App, { emitter, meta: opts.meta, initialEvents: previous }), {
    exitOnCtrlC: true,
  });
  let pos = fs.existsSync(opts.eventFile) ? fs.statSync(opts.eventFile).size : 0;
  const timer = setInterval(() => {
    let fd: any = null;
    try {
      const st = fs.statSync(opts.eventFile);
      if (st.size <= pos) return;
      fd = fs.openSync(opts.eventFile, 'r');
      const buf = Buffer.alloc(st.size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      pos = st.size;
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (!line) continue;
        try {
          emitter.emit('event', JSON.parse(line));
        } catch {}
      }
    } finally {
      if (fd != null)
        try {
          fs.closeSync(fd);
        } catch {}
    }
  }, 250);
  try {
    await app.waitUntilExit();
  } finally {
    clearInterval(timer);
    emitter.removeAllListeners();
  }
}
