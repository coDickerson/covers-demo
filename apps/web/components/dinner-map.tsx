'use client';
// One dinner: the bell walks real results, the decision opens in the middle, the right side follows what is happening.
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AuditEvent, PlanView, PolicyDocument, Receipt, Settlement, StepNote, Evaluation } from '@covers/contract';
import { fixtures, IDS } from '@covers/contract/fixtures';
import { ReceiptLine as ReceiptLineSchema } from '@covers/contract';
import { HISTORY_LIMITS } from '../lib/ask-limits';
import { covers, CoversClientError } from '../lib/client';
import { buildCard } from '../lib/doc-cards';
import { AUDIT_LABEL } from '../lib/documents';
import { openFlag, STEPS, stepOf, usd, type Role } from '../lib/dinner';
import { AUDIT_STEP, cardLimitOf, changedStations, dayOf, EASE_STANDARD, headcountOf, layoutPath, nameOf, restingStation, sourceOf, speakerOf, STEP_KEYS, stationsFor, thinkingLines, type DinnerState, type DocRef, type Station } from '../lib/map';
import { AppBar, readRole, setRoleCookie } from './app-bar';
import { Bell, BELL_FRAMES } from './bell';
import { BELL_ART, camera as frameOf, FLASH, GATE, LIFE, LIVES, PLACES, TOWN, TREE_LAYERS, WHEEL, townPath, type Camera } from '../lib/town';
import { DocCard } from './doc-card';
import { RampCard } from './ramp-card';
import { Stamp, type StampTone } from './stamp';
import { tokens } from '../lib/tokens';
import { useRuns, WALK_MS, type Stage } from './run-provider';

const STAMP_HOLD = 1800; // how long a CLEARED / SETTLED stamp stays on screen
const CHARGE_POLL_MS = 5000; // how often an open dinner map checks for the charge and for a phone close-out
const primary = 'cursor-pointer border border-ink-primary bg-accent px-4 py-2.5 font-strong text-on-accent disabled:cursor-default disabled:opacity-60';
const secondary = 'cursor-pointer border border-ink-primary px-4 py-2.5 font-strong hover:bg-bg-surface';
const MARK_BOX: Record<Station['mark'], string> = { clear: 'border-ink-primary bg-ink-primary', blocked: 'border-status-over bg-status-over', flagged: 'border-status-near bg-status-near', waiting: 'border-border bg-bg-surface', none: 'border-border bg-bg-surface' };
const MARK_TEXT: Record<Station['mark'], string> = { clear: 'text-status-ok', blocked: 'font-strong text-status-over', flagged: 'font-strong text-status-near', waiting: 'text-ink-muted', none: 'text-ink-muted' };
const MARK_WORD: Record<Station['mark'], string> = { clear: 'Clear', blocked: 'Blocked', flagged: 'Flagged', waiting: 'Waiting', none: 'After the dinner' };
const CARD_EDGE: Record<Station['mark'], string> = { clear: 'border-ink-primary', blocked: 'border-status-over', flagged: 'border-status-near', waiting: 'border-border', none: 'border-border' };
const ZOOM = 1.7;
const TONE_TEXT = { '': '', ok: 'text-status-ok', near: 'text-status-near', over: 'text-status-over' } as const;

/** The bell on the path: legs follow distance at a walking pace, the body bobs, it leans with the slope and hops on arrival. */
/** The town bell's frames (public/town/bell-N.png): 0 stand, 1–2 walk, 4 hop. Walk frames 1–4 alternate the two steps. */
const TOWN_FRAME = [0, 1, 2, 1, 2] as const;

function Walker({ pathRef, trailRef, target, startAtZero, paced, alert, onClick, art = false, onMove }: {
  pathRef: React.RefObject<SVGPathElement | null>; trailRef: React.RefObject<SVGPathElement | null>; target: number; startAtZero: boolean; paced: boolean; alert: boolean; onClick: () => void;
  /** Town mode: the path is in the town's art pixels and the bell is drawn on that same pixel grid, leaving footprints. */ art?: boolean;
  /** Called with the bell's art position as it walks (moving) and when it stops, so the camera can follow it. */ onMove?: (x: number, y: number, moving: boolean) => void;
}) {
  const [prints, setPrints] = useState<{ id: number; x: number; y: number }[]>([]);
  const printId = useRef(0), lastPrint = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const position = useRef<number | null>(null);
  const wasAtStart = useRef(false);
  const lastX = useRef<number | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;
  const [frame, setFrame] = useState(0);

  useLayoutEffect(() => {
    const path = pathRef.current, trail = trailRef.current, el = box.current, sprite = body.current;
    if (!path || !el || !sprite) return;
    const total = path.getTotalLength();
    if (!total) return;
    if (trail) trail.style.strokeDasharray = String(total);
    let facing = 1;
    const place = (length: number) => {
      position.current = length;
      const p = path.getPointAtLength(length);
      // In the town, snap to whole art pixels so the bell's pixels line up with the town's.
      el.style.transform = art ? `translate(${Math.round(p.x - BELL_ART.width / 2)}px, ${Math.round(p.y - BELL_ART.height + 2)}px)` : `translate(${p.x}px, ${p.y - 9}px) translate(-50%, -100%)`;
      if (art) {
        const lp = lastPrint.current;
        if (!lp) lastPrint.current = { x: p.x, y: p.y };
        else if (Math.hypot(p.x - lp.x, p.y - lp.y) >= 5) {
          lastPrint.current = { x: p.x, y: p.y };
          const side = printId.current % 2 ? 2 : -2, id = ++printId.current;
          setPrints((list) => [...list.slice(-30), { id, x: Math.round(p.x + side), y: Math.round(p.y + 1) }]);
        }
      }
      if (art) { const dx = p.x - (lastX.current ?? p.x); if (Math.abs(dx) > 0.2) facing = dx < 0 ? -1 : 1; lastX.current = p.x; }
      sprite.style.transform = `scaleX(${facing})`;
      if (trail) trail.style.strokeDashoffset = String(total - length);
    };
    const to = (target / 100) * total;
    // In town the bell never jumps: it appears where it belongs once, then always walks there along the sidewalks.
    if (position.current === null) { place(startAtZero && !art ? 0 : to); if (!startAtZero || art) return; }
    else if (startAtZero && !wasAtStart.current && !art) place(0);
    wasAtStart.current = startAtZero;
    const from = position.current!;
    if (!art) facing = to < from ? -1 : 1;
    if (Math.abs(to - from) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { place(to); setFrame(0); return; }
    const duration = paced ? WALK_MS - tokens['motion/duration/fast'] / 2 : art ? Math.min(6500, Math.max(600, Math.abs(to - from) * 11)) : Math.min(1500, Math.max(420, Math.abs(to - from) * 3)), start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration), eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2, length = from + (to - from) * eased;
      place(length);
      const at = path.getPointAtLength(length);
      moved.current?.(at.x, at.y, t < 1);
      if (t < 1) { setFrame((Math.floor(Math.abs(length - from) / (art ? 4 : 16)) % (BELL_FRAMES - 1)) + 1); raf = requestAnimationFrame(tick); return; }
      setFrame(0);
      sprite.animate([{ translate: '0 0' }, { translate: art ? '0 -4px' : '0 -12px' }, { translate: '0 0' }], { duration: tokens['motion/duration/slow'] / 1.6, easing: EASE_STANDARD });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, pathRef, trailRef, startAtZero, paced, art]);

  return (
    <>
    {art && prints.map((f) => <i key={f.id} className="covers-print pointer-events-none absolute bg-ink-muted" style={{ left: f.x, top: f.y, width: 2, height: 1 }} />)}
    <div ref={box} data-testid="bell" className={`pointer-events-auto absolute top-0 left-0 z-10 ${art ? '' : 'w-9.5'}`} style={art ? { width: BELL_ART.width, height: BELL_ART.height } : undefined}>
      <div className="relative">
        <button onClick={onClick} disabled={!alert} aria-label={alert ? 'Open the decision' : 'Covers guide'} className={`block w-full ${alert ? 'cursor-pointer' : 'cursor-default'}`}>
          <div ref={body} className="origin-bottom">
            {art
              ? <img src={`/town/bell-${TOWN_FRAME[frame % TOWN_FRAME.length]}.png`} alt="" width={BELL_ART.width} height={BELL_ART.height} draggable={false} className="block [image-rendering:pixelated]" />
              : <Bell frame={frame} className={`block w-full ${frame === 2 || frame === 4 ? '-translate-y-0.75' : ''}`} />}
          </div>
        </button>
        {alert && <i className="pointer-events-none absolute -top-1.5 -right-3 size-4.5 bg-status-over text-center text-small leading-4.5 font-bold text-bg-surface not-italic">!</i>}
      </div>
    </div>
    </>
  );
}

export function DinnerMap({ planId }: { planId: string }) {
  const { runs, play } = useRuns();
  const run = runs[planId];
  const [core, setCore] = useState<{ view: PlanView; rounds: Evaluation[]; receipt: Receipt | null; settlement: Settlement | null } | null>(null);
  const [notes, setNotes] = useState<StepNote[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [role, setRole] = useState<Role>('rep');
  const [viewing, setViewing] = useState<number | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [doc, setDoc] = useState<DocRef | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [auditRow, setAuditRow] = useState<string | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [stationNote, setStationNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const world = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);

  const load = useCallback(async () => {
    const [view, rounds, receipt, settlement] = await Promise.all([covers.getPlan(planId), covers.listEvaluations(planId), covers.getReceipt(planId), covers.getSettlement(planId)]);
    const next = { view, rounds, receipt, settlement };
    setCore(next);
    return next;
  }, [planId]);
  const loadAudit = useCallback(async () => { const a = await covers.listAudit({ planId }); setAudit(a); return a; }, [planId]);

  useEffect(() => { setRole(readRole()); void load(); void loadAudit(); void covers.listDocuments().then(setDocuments); }, [load, loadAudit]);
  // From the moment the card is issued until the dinner is settled, the rep may act on their phone (/m/{id}): watch for
  // the card charge in Ramp, and for a receipt or settlement made elsewhere, so the map catches up without a refresh.
  const watching = !!core?.view.plan.fundId && !core.settlement;
  const seenRef = useRef({ charged: false, receipt: false });
  seenRef.current = { charged: !!core?.view.closeOut, receipt: !!core?.receipt };
  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      const was = seenRef.current;
      const [charge, receipt, settlement] = await Promise.all([
        was.charged ? Promise.resolve(null) : covers.checkForCharge(planId).catch(() => null),
        covers.getReceipt(planId).catch(() => null),
        covers.getSettlement(planId).catch(() => null),
      ]);
      if (!stopped && ((charge && !was.charged) || (!!receipt !== was.receipt) || settlement)) { await load(); void loadAudit(); }
    };
    const id = window.setInterval(() => void tick(), CHARGE_POLL_MS);
    void tick();
    return () => { stopped = true; window.clearInterval(id); };
  }, [watching, planId, load, loadAudit]);
  // The storyboard's closure moments: stamp the map when the plan clears and when the dinner closes out, whether that
  // happened here or on the rep's phone. Nothing on first load: only on a change while the page is open.
  const [stamp, setStamp] = useState<{ text: string; tone: StampTone } | null>(null);
  const [pendingStamp, setPendingStamp] = useState<{ text: string; tone: StampTone; after: number } | null>(null);
  const lastStatus = useRef<{ status: string; settled: boolean } | null>(null);
  const status = core?.view.plan.status, settledNow = !!core?.settlement, toCompliance = !!core?.settlement?.exceptions.length;
  useEffect(() => {
    if (!status) return;
    const was = lastStatus.current;
    lastStatus.current = { status, settled: settledNow };
    if (!was) return;
    // `after`: the stamp lands once the bell has walked past this step (Check = 1, Close out = 4), or right away if it isn't walking.
    const next = !was.settled && settledNow ? { ...(toCompliance ? { text: 'TO COMPLIANCE', tone: 'near' as const } : { text: 'SETTLED', tone: 'ok' as const }), after: 4 }
      : was.status !== 'cleared' && status === 'cleared' && !settledNow ? { text: 'CLEARED', tone: 'ok' as const, after: 1 } : null;
    if (next) setPendingStamp(next);
  }, [status, settledNow, toCompliance]);
  // Land the stamp once the bell has finished that step's checks, not while it is still walking them.
  useEffect(() => {
    if (!pendingStamp || (run && run.step <= pendingStamp.after)) return;
    setStamp({ text: pendingStamp.text, tone: pendingStamp.tone }); setPendingStamp(null);
  }, [pendingStamp, run]);
  useEffect(() => {
    if (!stamp) return;
    const id = window.setTimeout(() => setStamp(null), STAMP_HOLD);
    return () => window.clearTimeout(id);
  }, [stamp]);
  useLayoutEffect(() => {
    const el = world.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [core === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const state: DinnerState | null = useMemo(() => (core ? { ...core, notes, audit } : null), [core, notes, audit]);
  const step = core ? stepOf(core.view, core.receipt, core.settlement, role) : 0;
  const shown = run?.step ?? viewing ?? step;
  const stations = useMemo(() => (state ? stationsFor(shown, state, shown === 1 && round !== null ? round : undefined) : []), [state, shown, round]);
  const [overview, setOverview] = useState(false);
  // The viewer can drag the town and zoom with the wheel; following the dinner (or a new step) puts the camera back.
  const [look, setLook] = useState<Camera | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; cam: Camera } | null>(null);
  useEffect(() => setLook(null), [shown, overview]);
  const geometry = useMemo(() => townPath(shown, stations.length || 1, size.w, size.h, overview, look), [shown, stations.length, size.w, size.h, overview, look]);
  const camRef = useRef(geometry.camera);
  camRef.current = geometry.camera;
  // Follow the bell on long walks: once it would leave the frame, the camera keeps it centred (plaques fade while it
  // travels); once it is back inside this step's frame, the camera eases back to the step.
  const artLayer = useRef<HTMLDivElement>(null);
  const chase = useRef(false);
  const [chasing, setChasing] = useState(false);
  const follow = useCallback((x: number, y: number, moving: boolean) => {
    const el = artLayer.current, box = world.current, cam = camRef.current;
    if (!el || !box) return;
    const w = box.clientWidth, h = box.clientHeight, sx = cam.x + x * cam.scale, sy = cam.y + y * cam.scale, m = Math.min(w, h) * 0.1;
    const outside = sx < m || sx > w - m || sy < m || sy > h - m;
    const settled = sx > m * 2 && sx < w - m * 2 && sy > m * 2 && sy < h - m * 2;
    if (moving && (outside || (chase.current && !settled))) {
      if (!chase.current) { chase.current = true; setChasing(true); }
      el.style.transition = 'none';
      el.style.transform = `translate(${w / 2 - x * cam.scale}px, ${h / 2 - y * cam.scale}px) scale(${cam.scale})`;
      return;
    }
    if (chase.current) {
      chase.current = false;
      el.style.transition = '';
      el.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
      setChasing(false);
    }
  }, []);
  useEffect(() => {
    const el = world.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camRef.current, box = el.getBoundingClientRect(), px = e.clientX - box.left, py = e.clientY - box.top;
      const least = frameOf(0, el.clientWidth, el.clientHeight, true).scale * 0.8;
      const scale = Math.min(4, Math.max(least, cam.scale * Math.exp(-e.deltaY * 0.0015)));
      setLook({ scale, x: px - ((px - cam.x) / cam.scale) * scale, y: py - ((py - cam.y) / cam.scale) * scale });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [core === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, [role=dialog], input, textarea')) return;
    drag.current = { x: e.clientX, y: e.clientY, cam: camRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setLook({ ...d.cam, x: d.cam.x + e.clientX - d.x, y: d.cam.y + e.clientY - d.y });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };
  // Plaques never overlap: measure each one, then give it the nearest free spot around its station, inside the map.
  const plaqueEls = useRef<(HTMLButtonElement | null)[]>([]);
  const [plaques, setPlaques] = useState<{ x: number; y: number }[]>([]);
  useLayoutEffect(() => {
    const gap = 6, lift = geometry.camera.scale * 30, top = 44, placed: { l: number; t: number; r: number; b: number }[] = [];
    const next = geometry.points.map((p, i) => {
      const el = plaqueEls.current[i], w = el?.offsetWidth ?? 140, h = el?.offsetHeight ?? 60;
      const base = { x: p.x, y: p.y - lift };
      const candidates: { x: number; y: number; cost: number }[] = [];
      for (const dy of [0, -1, -2, 1, -3, 2]) for (const dx of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
        const x = base.x + dx * (w + gap), y = dy === 1 || dy === 2 ? p.y + lift * 0.3 + h + (dy - 1) * (h + gap) : base.y + dy * (h + gap);
        candidates.push({ x, y, cost: Math.hypot(x - base.x, (y - base.y) * 1.3) });
      }
      candidates.sort((a, b) => a.cost - b.cost);
      const rect = (c: { x: number; y: number }) => ({ l: c.x - w / 2, t: c.y - h, r: c.x + w / 2, b: c.y });
      const clear = (r: ReturnType<typeof rect>) => placed.every((q) => r.r + gap <= q.l || r.l >= q.r + gap || r.b + gap <= q.t || r.t >= q.b + gap);
      const inside = (r: ReturnType<typeof rect>) => r.l >= gap && r.r <= size.w - gap && r.t >= top && r.b <= size.h - gap;
      const pick = candidates.find((c) => clear(rect(c)) && inside(rect(c))) ?? candidates.find((c) => clear(rect(c))) ?? candidates[0]!;
      placed.push(rect(pick));
      return { x: pick.x, y: pick.y };
    });
    setPlaques((old) => (old.length === next.length && old.every((o, i) => o.x === next[i]!.x && o.y === next[i]!.y) ? old : next));
  }, [geometry, stations, size.w, size.h]);
  // The vault wheel turns once when Ramp issues the card while the page is open.
  const fundRef = useRef<string | null | undefined>(undefined);
  const [vaultTurn, setVaultTurn] = useState(0);
  const fundId = core?.view.plan.fundId ?? null;
  useEffect(() => {
    if (fundRef.current === null && fundId) setVaultTurn((n) => n + 1);
    if (core) fundRef.current = fundId;
  }, [fundId, core]);

  if (!core || !state) return <main className="grid h-dvh place-items-center text-ink-muted">Loading…</main>;
  const { view, receipt, settlement, rounds } = core;
  const { plan, evaluation } = view;
  const flag = openFlag(evaluation, settlement);
  const blocker = !settlement ? evaluation?.checks.find((c) => c.outcome === 'block') : undefined;
  const denied = !settlement ? evaluation?.checks.find((c) => c.denial) : undefined;
  const blockedCap = blocker?.subject.kind === 'hcp' ? evaluation?.caps.find((c) => blocker.subject.kind === 'hcp' && c.npi === blocker.subject.npi && c.state === 'over') : undefined;
  const limit = cardLimitOf(plan);
  const speakerNpi = speakerOf(plan)?.hcp.npi ?? IDS.patel;
  const everyone = [speakerNpi, ...plan.inviteeNpis, 'rep'];
  const ate = everyone.filter((id) => !absent.has(id)).length;
  const label = (id: string) => (id === 'rep' ? nameOf(plan.repId) : nameOf(id));

  const pace = (s: DinnerState, target: number, count?: number): Stage => {
    const list = stationsFor(target, s).slice(0, count);
    return { step: target, names: list.map((x) => x.name), lines: list.map((x) => thinkingLines(x).length) };
  };
  const act = async (fn: () => Promise<unknown>, stages?: (s: DinnerState) => Stage[]) => {
    setBusy(true); setError(null);
    try {
      await fn();
      const next = await load();
      void loadAudit();
      setViewing(null); setRound(null); setPicked(null); setDoc(null); setNote(''); setDecisionOpen(true);
      if (stages) await play(planId, stages({ ...next, notes, audit }));
    } catch (e) { setError(e instanceof CoversClientError ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };
  const afterCheck = (s: DinnerState): Stage[] => (s.view.plan.status === 'cleared' ? [{ ...pace(s, 1, 5), exit: true }, pace(s, 2, 3)] : [pace(s, 1, 5)]);
  /** After an edit, the bell only goes back to the checks whose results changed. */
  const afterUpdate = (s: DinnerState): Stage[] => {
    const before = s.rounds.at(-2), after = s.rounds.at(-1);
    if (!before || !after) return afterCheck(s);
    const recheck = changedStations(before, after), list = stationsFor(1, s);
    const stage: Stage = { step: 1, recheck, names: recheck.map((i) => list[i]!.name), lines: recheck.map((i) => thinkingLines(list[i]!).length) };
    return s.view.plan.status === 'cleared' ? [{ ...stage, exit: true }, pace(s, 2, 3)] : [stage];
  };
  const check = () => act(() => covers.evaluatePlan(planId), afterCheck);
  const removeGuest = (npi: string) => act(async () => { await covers.updatePlan(planId, { inviteeNpis: plan.inviteeNpis.filter((n) => n !== npi) }); await covers.evaluatePlan(planId); }, afterUpdate);
  const issue = () => act(() => covers.issueFund(planId), (s) => [{ step: 2, names: ['Ramp'], lines: [1], start: 3, exit: true }, pace(s, 3, 1)]);
  const addReceipt = () => act(() => covers.submitReceipt(planId, { sampleId: IDS.cleanReceipt }), (s) => [{ step: 3, names: ['Dinner', 'Charge', 'Reminder'], lines: [1, 1, 1], start: 1, exit: true }, pace(s, 4, 3)]);
  const confirm = () => act(() => covers.confirmAttendance({ planId, attendedNpis: everyone.filter((id) => id !== 'rep' && !absent.has(id)), employeesPresent: absent.has('rep') ? 0 : 1, extraGuests: 0, confirmedBy: plan.repId }), (s) => [{ step: 4, names: ['Who ate'], lines: [1], start: 3, exit: true }, pace(s, 5)]);
  const decide = (verdict: 'approve' | 'deny') => act(() => (verdict === 'approve' ? covers.approveException : covers.denyException)(planId, flag!.id, note.trim() || (verdict === 'approve' ? 'Approved' : 'Denied')), (s) => (s.view.plan.status === 'closed' ? [pace(s, 6)] : []));
  const switchRole = (r: Role) => { setRoleCookie(r); setRole(r); setViewing(null); setDecisionOpen(true); setError(null); };
  const reset = () => act(async () => { await covers.reset(); switchRole('rep'); setAbsent(new Set()); setRound(null); });
  const addStationNote = async (s: Station) => {
    const text = stationNote.trim();
    if (!text) return;
    try { await covers.addNote(planId, { step: STEP_KEYS[shown]!, target: s.name, text }); setStationNote(''); setNotes(await covers.listNotes(planId)); void loadAudit(); }
    catch (e) { setError(e instanceof CoversClientError ? e.message : 'The note was not saved.'); }
  };
  const pickStation = (i: number) => { setPicked(i); setStationNote(''); void covers.listNotes(planId).then(setNotes); };
  const openDoc = (r: DocRef) => { setDoc(r); if (r.doc === 'audit') void loadAudit(); };
  const toggle = (id: string) => setAbsent((a) => { const n = new Set(a); if (!n.delete(id)) n.add(id); return n; });

  // What this dinner is waiting for, and from whom.
  const owner: Role = step === 6 || (step === 1 && !blocker && !denied && !!flag) || (step === 5 && !!flag) ? 'compliance' : 'rep';
  const hasDecision = !(step === 5 && !flag) && !(step === 6 && !flag);
  const closed = plan.status === 'closed';
  const canDecide = hasDecision && !closed && viewing === null && !run && !busy;
  const mine = canDecide && owner === role;
  const showDecision = canDecide && decisionOpen && picked === null;

  const resting = picked ?? (shown === step ? restingStation(stations) : stations.length - 1);
  const target = run?.exit ? geometry.stops.at(-1)! : geometry.stops[(run ? run.at : resting) + 1] ?? geometry.stops[0]!;
  const visible = (i: number) => !run || run.step !== shown || (run.recheck ? !run.recheck.includes(i) : i < run.seen);
  // The gate: down until the red-flag check has been seen clear; held down (its light racing) while it is flagged.
  const redFlags = shown === 1 ? stations.findIndex((s) => s.name === 'Red flags') : -1;
  const gate: 'open' | 'closed' | 'held' = shown > 1 || step > 1 ? 'open' : redFlags >= 0 && visible(redFlags) ? (stations[redFlags]!.mark === 'clear' ? 'open' : 'held') : 'closed';
  const docModel = doc && buildCard(doc, state, documents);
  const caps = settlement?.caps.length ? settlement.caps : evaluation?.caps ?? [];
  const pickedStation = picked !== null ? stations[picked] : undefined;
  const zoomed = picked !== null;
  const zoomPoint = picked !== null ? geometry.points[picked] : undefined;
  const zoomLeft = picked !== null && picked < stations.length / 2;
  const stationNotes = pickedStation ? notes.filter((n) => n.step === STEP_KEYS[shown] && n.target === pickedStation.name) : [];

  function Decision() {
    const waitingOn = (who: Role, line: string) => (
      <><h2 className="text-verdict leading-tight font-bold tracking-tight">{line}</h2><p className="mt-2 text-ink-secondary">This is with {who === 'compliance' ? nameOf(IDS.compliance) : nameOf(plan.repId)}.</p><div className="mt-4"><button className={secondary} onClick={() => switchRole(who)}>Open as {who === 'compliance' ? 'compliance' : 'the rep'}</button></div></>
    );
    if (owner !== role) return waitingOn(owner, owner === 'compliance' ? 'Waiting on compliance' : 'Waiting on the rep');
    const Head = ({ tag, tone, children }: { tag: string; tone: keyof typeof TONE_TEXT; children: React.ReactNode }) => <><span className={`block font-mono text-micro ${TONE_TEXT[tone]}`}>{tag}</span><h2 className="mt-1 text-verdict leading-tight font-bold tracking-tight">{children}</h2></>;
    if (step === 0) return <><Head tag="READY" tone="">Run the checks on this dinner?</Head><p className="mt-2 text-ink-secondary">{plan.inviteeNpis.length} clinicians, {usd(plan.estimatedPerPerson)} per person, all in.</p><div className="mt-4"><button disabled={busy} className={primary} onClick={check}>Start checks</button></div></>;
    if (step === 1 && blockedCap) return <><Head tag="BLOCKED" tone="over">{nameOf(blockedCap.npi)} would pass the annual limit</Head><div className="mt-2 font-mono text-amount">{usd(blockedCap.ytdCents)} + {usd(blockedCap.projectedCents - blockedCap.ytdCents)} = <b className="text-status-over">{usd(blockedCap.projectedCents)}</b> of {usd(blockedCap.capCents)}</div><p className="mt-2 text-ink-secondary">The card stays locked until this is fixed.</p><div className="mt-4 flex gap-2"><button disabled={busy} className={primary} onClick={() => removeGuest(blockedCap.npi)}>Remove {nameOf(blockedCap.npi)}</button><button className={secondary} onClick={() => openDoc({ label: 'Annual totals', doc: 'ledger', at: blockedCap.npi })}>See why</button></div></>;
    if (step === 1 && (blocker || denied)) return <><Head tag="BLOCKED" tone="over">{(blocker ?? denied)!.message}</Head><p className="mt-2 text-ink-secondary">The card stays locked until the plan changes.</p></>;
    if ((step === 1 || step === 6) && flag) {
      const line = flag.subject.kind === 'line' ? receipt?.lines.find((l) => flag.subject.kind === 'line' && l.id === flag.subject.lineId) : undefined;
      return <><Head tag="FOR COMPLIANCE" tone="near">{line ? `${usd(line.amountCents)} of alcohol: approve it?` : flag.message}</Head>{line && <div className="mt-2 font-mono text-amount">{line.text}</div>}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record" className="mt-3 w-full border border-border bg-bg-canvas px-2.5 py-2" /><div className="mt-3 flex gap-2"><button disabled={busy} className={primary} onClick={() => decide('approve')}>Approve</button><button disabled={busy} className={secondary} onClick={() => decide('deny')}>Deny</button></div></>;
    }
    if (step === 2) return <><Head tag="CLEARED" tone="ok">Issue the {usd(limit)} card?</Head><div className="mt-2 font-mono text-amount">{headcountOf(plan)} people × {usd(fixtures.company.perPersonCapCents)}</div><p className="mt-2 text-ink-secondary">Restricted to restaurants, for this dinner.</p><div className="mt-4"><button disabled={busy} className={primary} onClick={issue}>Issue the card</button></div></>;
    if (step === 3) return <><Head tag="AFTER THE DINNER" tone="">Add the receipt</Head><p className="mt-2 text-ink-secondary">The card is ready for {dayOf(plan)}. This demo uses a sample receipt.</p><div className="mt-4"><button disabled={busy} className={primary} onClick={addReceipt}>Add the receipt</button></div></>;
    if (step === 4 && receipt) return (
      <><Head tag="CLOSE OUT" tone="">Who ate?</Head>
        <div className="mt-3 grid grid-cols-2 gap-x-4">{everyone.map((id) => <button key={id} onClick={() => toggle(id)} className={`flex cursor-pointer justify-between gap-2 border-b border-border py-1.5 text-left ${absent.has(id) ? 'text-ink-muted line-through' : ''}`}><span className="truncate">{label(id)}</span><span>{absent.has(id) ? '' : '✓'}</span></button>)}</div>
        <div className="mt-3 flex items-center justify-between"><span className="font-mono text-amount">{ate} × {ate ? usd(Math.round(receipt.totalCents / ate)) : usd(0)}</span><button disabled={busy || ate === 0} className={primary} onClick={confirm}>Confirm</button></div></>
    );
    return null;
  }

  const DOT = { pass: 'bg-status-ok', flag: 'bg-status-near', block: 'bg-status-over' } as const;
  const replan = (patch: Parameters<typeof covers.updatePlan>[1]) => act(async () => { await covers.updatePlan(planId, patch); if (evaluation) await covers.evaluatePlan(planId); }, evaluation ? afterUpdate : undefined);
  const saveLine = async (lineId: string, patch: Parameters<typeof covers.fixLine>[2]) => {
    setBusy(true); setError(null);
    try { await covers.fixLine(receipt!.id, lineId, patch); await load(); void loadAudit(); }
    catch (e) { setError(e instanceof CoversClientError ? e.message : 'That change was not saved.'); }
    finally { setBusy(false); }
  };
  const toCents = (v: string) => { const n = Number(v.replace(/[$,]/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };

  function Editor({ name }: { name: string }) {
    const planOpen = role === 'rep' && !plan.fundId && !receipt && !settlement && !run && !busy;
    const field = 'border border-border bg-bg-canvas px-2 py-1.5';
    const save = 'cursor-pointer border border-ink-primary px-3 py-1.5 font-strong';
    if (planOpen && name === 'Speaker') return (
      <label className="block">Speaker
        <select defaultValue={plan.speakerId} onChange={(e) => replan({ speakerId: e.target.value })} className={`${field} mt-1 block w-full`}>{fixtures.speakers.map((sp) => <option key={sp.id} value={sp.id}>{sp.hcp.name}</option>)}</select>
      </label>
    );
    if (planOpen && ['Guests', 'Identity', 'Annual limit', 'Red flags'].includes(name)) return <ul>{plan.inviteeNpis.map((n) => <li key={n} className="flex items-center justify-between gap-2 border-b border-border py-1.5"><span>{nameOf(n)}</span><button className="cursor-pointer text-small underline" onClick={() => removeGuest(n)}>Remove</button></li>)}</ul>;
    if (planOpen && ['Estimate', 'Meal limit'].includes(name)) return (
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const c = toCents(String(new FormData(e.currentTarget).get('amount'))); if (c === null) return setError('Enter a dollar amount.'); void replan({ estimatedPerPerson: c }); }}>
        <label className="min-w-0 flex-1">Estimate per person, all in<input name="amount" inputMode="decimal" defaultValue={(plan.estimatedPerPerson / 100).toFixed(2)} className={`${field} mt-1 block w-full font-mono`} /></label><button className={save}>Save and re-check</button>
      </form>
    );
    if (planOpen && name === 'Venue') return (
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void replan({ venue: String(new FormData(e.currentTarget).get('venue')) }); }}>
        <label className="min-w-0 flex-1">Venue<input name="venue" defaultValue={plan.venue} className={`${field} mt-1 block w-full`} /></label><button className={save}>Save</button>
      </form>
    );
    if (role === 'rep' && receipt && !settlement && ['Photo', 'Read', 'Adds up'].includes(name)) return (
      <div>
        {receipt.lines.map((l) => (
          <div key={`${l.id}-${l.amountCents}-${l.category}`} className="grid grid-cols-[minmax(0,1fr)_92px_92px] items-center gap-2 border-b border-border py-1">
            <span className="truncate">{l.text}</span>
            <select aria-label={`Category for ${l.text}`} defaultValue={l.category} onChange={(e) => saveLine(l.id, { category: e.target.value as typeof l.category })} className={`${field} py-1 text-small`}>{ReceiptLineSchema.shape.category.options.map((c) => <option key={c}>{c}</option>)}</select>
            <input aria-label={`Amount for ${l.text}`} inputMode="decimal" defaultValue={(l.amountCents / 100).toFixed(2)} onBlur={(e) => { const c = toCents(e.target.value); if (c === null) return setError('Enter a dollar amount.'); if (c !== l.amountCents) void saveLine(l.id, { amountCents: c }); }} className={`${field} py-1 text-right font-mono text-small`} />
          </div>
        ))}
      </div>
    );
    return null;
  }

  function Detail() {
    if (!pickedStation) return null;
    const editor = Editor({ name: pickedStation.name }), showCaps = pickedStation.name === 'Annual limit' && caps.length > 0;
    const trouble = pickedStation.checks?.find((c) => c.outcome !== 'pass');
    const headline = pickedStation.checks?.length ? trouble?.message ?? `All ${pickedStation.checks.length} checks passed` : pickedStation.found;
    return (
      <div role="region" aria-label={pickedStation.name} className={`absolute top-1/2 z-25 flex max-h-[96%] min-h-[62%] -translate-y-1/2 flex-col border border-ink-primary bg-bg-surface ${zoomLeft ? 'right-[2%] left-[27%]' : 'right-[27%] left-[2%]'}`}>
        <header className="flex items-start justify-between gap-6 border-b border-border px-7 pt-5 pb-4">
          <div className="min-w-0"><span className={`font-mono text-micro ${MARK_TEXT[pickedStation.mark]}`}>{STEPS[shown]!.toUpperCase()} · {pickedStation.name.toUpperCase()} · {(pickedStation.word ?? MARK_WORD[pickedStation.mark]).toUpperCase()}</span><h2 className="mt-1 line-clamp-2 text-verdict leading-tight font-bold tracking-tight">{headline}</h2></div>
          <button aria-label="Zoom out" className="cursor-pointer text-title leading-none" onClick={() => setPicked(null)}>×</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="min-h-0 overflow-auto px-7 py-5">
            <div className="flex items-center justify-between gap-3"><h3 className="text-small font-bold text-ink-muted">What the agent did</h3>{shown === 1 && rounds.length > 1 && <div className="flex gap-1.5">{rounds.map((_, n) => <button key={n} onClick={() => setRound(n)} className={`cursor-pointer border px-2 py-0.5 text-small ${(round ?? rounds.length - 1) === n ? 'border-ink-primary bg-accent-tint' : 'border-border'}`}>Round {n + 1}</button>)}</div>}</div>
            <ol className="mt-2 border-t border-border">
              {pickedStation.checks?.length ? pickedStation.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 border-b border-border py-2.5">
                  <i className={`mt-1.5 size-2 shrink-0 rounded-pill ${DOT[c.outcome]}`} />
                  <span className="min-w-0 flex-1">{c.message}{(c.approval || c.denial) && <small className="mt-0.5 block text-small text-ink-muted">{c.denial ? 'Denied' : 'Approved'} by {nameOf((c.denial ?? c.approval)!.by)}: {(c.denial ?? c.approval)!.note}</small>}</span>
                  <button className="shrink-0 cursor-pointer text-small underline" onClick={() => openDoc(sourceOf(c))}>Rule</button>
                </li>
              )) : thinkingLines(pickedStation).map((line, i) => <li key={i} className="border-b border-border py-2.5">{line}</li>)}
            </ol>
            {showCaps && <><h3 className="mt-5 text-small font-bold text-ink-muted">Annual totals with this dinner</h3>{caps.map((c) => <div key={c.npi} className="py-1.5"><div className="flex justify-between gap-2"><span>{nameOf(c.npi)}</span><span className="font-mono text-small">{usd(c.projectedCents)} of {usd(c.capCents)}</span></div><div className="relative mt-1 h-(--size-capbar-height) bg-border"><u className={`absolute inset-y-0 left-0 ${c.state === 'over' ? 'bg-status-over' : c.state === 'near' ? 'bg-status-near' : 'bg-ink-primary'}`} style={{ width: `${Math.min(100, (c.projectedCents / c.capCents) * 100)}%` }} /></div></div>)}</>}
          </section>
          <section className="flex min-h-0 flex-col gap-5 overflow-auto border-l border-border bg-bg-canvas px-6 py-5">
            {editor && <div><h3 className="mb-2 text-small font-bold text-ink-muted">Change this</h3>{editor}</div>}
            {error && <div role="alert" className="text-status-over">{error}</div>}
            {pickedStation.link && <a href={pickedStation.link.url} target="_blank" rel="noreferrer" className="self-start border border-ink-primary px-3 py-1.5 font-strong hover:bg-bg-surface">{pickedStation.link.label} ↗</a>}
            {pickedStation.looked.length > 0 && <div><h3 className="text-small font-bold text-ink-muted">Sources</h3><div className="mt-1.5 flex flex-wrap gap-1.5">{pickedStation.looked.map((r) => <button key={`${r.doc}:${r.at}`} onClick={() => openDoc(r)} className="cursor-pointer border border-border bg-bg-surface px-2 py-1 text-small hover:border-ink-primary">{r.label}</button>)}</div></div>}
            <div><h3 className="text-small font-bold text-ink-muted">On the record</h3>
              {stationNotes.map((n) => <div key={n.id} className="mt-1.5 border-b border-border pb-1.5 text-small"><span className="text-ink-muted">{nameOf(n.by)}: </span>{n.text}</div>)}
              <div className="mt-2 flex gap-1.5"><input value={stationNote} onChange={(e) => setStationNote(e.target.value)} placeholder="Add a note" className="min-w-0 flex-1 border border-border bg-bg-surface px-2 py-1.5" /><button className="cursor-pointer border border-ink-primary px-3 font-strong" onClick={() => addStationNote(pickedStation)}>Add</button></div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    const history = chat.slice(-HISTORY_LIMITS.turns).map((m) => ({ ...m, content: m.content.slice(0, HISTORY_LIMITS.chars) }));
    setChat((c) => [...c, { role: 'user', content: q }]); setQuestion(''); setAsking(true);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planId, question: q, history }) });
      const body = (await res.json()) as { ok: true; answer: string } | { ok: false; error: string };
      setChat((c) => [...c, { role: 'assistant', content: body.ok ? body.answer : body.error }]);
    } catch { setChat((c) => [...c, { role: 'assistant', content: 'The agent could not be reached. Try again.' }]); }
    finally { setAsking(false); }
  };
  const allChecks = [...(evaluation?.checks ?? []), ...(settlement?.checks ?? [])];

  const prev = shown > 0 ? shown - 1 : null;
  const next = shown < step ? shown + 1 : null;
  const arrow = (dir: 'l' | 'r', to: number | null) => (
    <button disabled={to === null} onClick={() => { if (to !== null) { setViewing(to === step ? null : to); setPicked(null); setRound(null); } }} title={to !== null ? STEPS[to] : undefined} className={`group absolute top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 ${dir === 'l' ? 'left-3' : 'right-3'} ${to === null ? 'cursor-default text-border' : 'cursor-pointer text-ink-primary'}`}>
      <svg viewBox="0 0 20 44" className="h-14 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d={dir === 'l' ? 'M17 2 3 22l14 20' : 'M3 2l14 20L3 42'} /></svg>
      {to !== null && <span className="hidden text-small font-strong group-hover:block">{STEPS[to]}</span>}
      <span className="sr-only">{dir === 'l' ? 'Previous step' : 'Next step'}</span>
    </button>
  );

  return (
    <div className="flex h-dvh flex-col">
      <div className="px-5 pt-3"><AppBar role={role} onRole={switchRole} /></div>
      <div className="relative flex min-h-0 flex-1 flex-col pt-2.5">
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-baseline gap-3 px-6"><b className="text-amount tracking-tight">{plan.title.replace(/^Speaker dinner: /, '')}</b><span className="text-small text-ink-muted">{dayOf(plan)} · {plan.venue.split(',')[0]} · {usd(limit)} limit</span><button onClick={reset} className="ml-auto cursor-pointer text-small text-ink-muted underline">Start this demo over</button></div>
          <ol className="flex px-[8%] pt-5 pb-1.5">
            {STEPS.map((name, i) => {
              const reachable = i <= step, now = i === shown;
              return (
                <li key={name} className="relative flex-1">
                  <i className={`absolute top-1.25 h-px ${i === 0 ? 'left-1/2' : 'left-0'} ${i === 6 ? 'right-1/2' : 'right-0'} ${i < step ? 'bg-ink-primary' : 'bg-border'}`} />
                  <button disabled={!reachable || !!run} aria-current={now ? 'step' : undefined} onClick={() => { setViewing(i === step ? null : i); setPicked(null); setRound(null); }} className={`relative flex w-full flex-col items-center gap-1.5 text-small ${reachable ? 'cursor-pointer text-ink-primary' : 'text-ink-muted'} ${now ? 'font-bold' : ''}`}>
                    <i className={`size-2.75 border ${now ? 'border-ink-primary bg-accent' : i < step ? 'border-ink-primary bg-ink-primary' : 'border-border bg-bg-canvas'}`} />{name}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex min-h-0 flex-1">
          <div ref={world} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
            {size.w > 0 && (
              <>
                {/* The town, framed on this step's place. The art scales with the camera; plaques and the bell sit on top in screen space. */}
                <div ref={artLayer} className={`pointer-events-none absolute top-0 left-0 ease-standard motion-reduce:transition-none ${dragging || look ? '' : 'transition-transform duration-[calc(var(--motion-duration-slow)*2)]'}`} style={{ width: TOWN.width, height: TOWN.height, transformOrigin: '0 0', transform: `translate(${geometry.camera.x}px, ${geometry.camera.y}px) scale(${geometry.camera.scale})` }}>
                  <img src={TOWN.src} alt={`The town: ${PLACES.map((p) => p.name).join(', ')}`} width={TOWN.width} height={TOWN.height} draggable={false} className="block [image-rendering:pixelated]" />
                  {/* The town is alive: trees rustle a pixel and the terrace's string lights twinkle. */}
                  {/* Life inside: pieces of the picture itself shift a pixel now and then (diners, chefs, typists, screens). */}
                  {LIVES.map((l, n) => <i key={`life-${n}`} className={`covers-${l.kind} absolute`} style={{ left: l.rect[0], top: l.rect[1], width: l.rect[2], height: l.rect[3], backgroundImage: `url(${TOWN.src})`, backgroundPosition: `${-l.rect[0]}px ${-l.rect[1]}px`, backgroundSize: `${TOWN.width}px ${TOWN.height}px`, imageRendering: 'pixelated', animationDuration: `calc(var(--motion-duration-slow) * ${l.every * 2})`, animationDelay: `calc(var(--motion-duration-slow) * ${-l.delay * 2})` }} />)}
                  <i className="covers-flash absolute bg-bg-surface" style={{ left: FLASH.x, top: FLASH.y, width: 2, height: 2 }} />
                  {TREE_LAYERS.map((t) => <img key={t.src} src={t.src} alt="" width={TOWN.width} height={TOWN.height} draggable={false} className="covers-rustle absolute inset-0 [image-rendering:pixelated]" style={{ animationDuration: `calc(var(--motion-duration-slow) * ${t.every * 2})`, animationDelay: `calc(var(--motion-duration-slow) * ${t.offset * 2})` }} />)}
                  {LIFE.bulbs.map(([x, y], n) => <i key={n} className="covers-twinkle absolute bg-accent" style={{ left: x, top: y, width: 1, height: 1, animationDelay: `calc(var(--motion-stagger) * ${(n * 7) % 19})` }} />)}
                  {/* The checkpoint's boom gate lifts once the red-flag check is clear, and stays down while something is flagged. */}
                  <i className="absolute origin-left transition-transform duration-[calc(var(--motion-duration-slow)*2)] ease-standard" style={{ left: GATE.x, top: GATE.y - 1.5, width: GATE.length, height: 3, transform: `rotate(${gate === 'open' ? GATE.open : GATE.closed}deg)`, backgroundImage: 'repeating-linear-gradient(90deg, var(--color-status-over) 0 4px, var(--color-bg-surface) 4px 8px)' }} />
                  <i className={`absolute ${gate === 'open' ? 'bg-status-ok' : 'bg-status-over'} ${gate === 'held' ? 'covers-blink-fast' : ''}`} style={{ left: GATE.light.x, top: GATE.light.y, width: 2, height: 2 }} />
                  {/* The bank's vault wheel turns when the card is issued. */}
                  <img key={`wheel-${vaultTurn}`} src="/town/wheel.png" alt="" width={WHEEL.size} height={WHEEL.size} draggable={false} className={`absolute [image-rendering:pixelated] ${vaultTurn ? 'covers-vault' : ''}`} style={{ left: WHEEL.x, top: WHEEL.y }} />
                  <img src="/town/mullion.png" alt="" width={WHEEL.bar.width} height={WHEEL.bar.height} draggable={false} className="absolute [image-rendering:pixelated]" style={{ left: WHEEL.bar.x, top: WHEEL.bar.y }} />
                  <svg className="pointer-events-none absolute inset-0 overflow-visible" width={TOWN.width} height={TOWN.height} aria-hidden="true">
                    <path ref={pathRef} d={geometry.artD} fill="none" stroke="none" />
                    <path key={`trail-${shown}`} ref={trailRef} d={geometry.artD} fill="none" stroke="none" />
                  </svg>
                  <Walker key={`bell-${size.w}-${size.h}`} art onMove={follow} pathRef={pathRef} trailRef={trailRef} target={target} startAtZero={run?.at === -1} paced={!!run} alert={mine && !decisionOpen} onClick={() => setDecisionOpen(true)} />
                </div>
                {stations.map((s, i) => {
                  const p = geometry.points[i]!, seen = visible(i), mark = seen ? s.mark : 'waiting';
                  const here = !!run && run.step === shown && run.at === i && run.seen === i && run.line > 0 && !seen;
                  const lines = thinkingLines(s), filled = seen ? lines.length : here ? run!.line : 0;
                  const at = plaques[i] ?? p;
                  return (
                    <button key={s.name} ref={(el) => { plaqueEls.current[i] = el; }} aria-label={`Open ${s.name}`} disabled={!(seen || here) || zoomed} onClick={() => pickStation(i)}
                      style={{ left: at.x, top: at.y }}
                      className={`absolute z-5 flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col gap-1 border bg-bg-surface px-2 py-1.5 text-left transition-[left,top,opacity,border-color] duration-[calc(var(--motion-duration-slow)*2)] ease-standard hover:border-ink-primary disabled:cursor-default ${here || (run?.at === i && run.step === shown) ? 'border-ink-primary' : CARD_EDGE[mark]} ${zoomed || chasing ? 'pointer-events-none opacity-0' : ''}`}>
                      <span className="flex items-center gap-1.5 text-small font-strong whitespace-nowrap"><i className={`size-2.5 shrink-0 border ${MARK_BOX[mark]}`} />{s.name}</span>
                      {lines.length > 2 && <span className="flex gap-0.5">{lines.map((_, n) => <i key={n} className={`size-2 transition-colors duration-(--motion-duration-fast) ease-standard ${n < filled ? (s.checks?.[n]?.outcome === 'block' ? 'bg-status-over' : s.checks?.[n]?.outcome === 'flag' ? 'bg-status-near' : 'bg-status-ok') : 'bg-border'}`} />)}</span>}
                      <small className={`text-micro whitespace-nowrap ${MARK_TEXT[mark]}`}>{seen ? s.word ?? MARK_WORD[s.mark] : here ? 'Checking' : run?.recheck?.includes(i) ? 'Rechecking' : 'Waiting'}</small>
                    </button>
                  );
                })}
              </>
            )}
            {stamp && <Stamp key={stamp.text} text={stamp.text} tone={stamp.tone} />}
            {!zoomed && <button onClick={() => { if (look && !overview) setLook(null); else setOverview((o) => !o); }} className="absolute top-3 left-6 z-10 cursor-pointer border border-ink-primary bg-bg-surface px-2.5 py-1 text-small font-strong hover:bg-accent-tint">{overview || look ? 'Follow the dinner' : 'See the whole town'}</button>}
            {!zoomed && <span className="pointer-events-none absolute top-4 left-48 z-10 text-micro text-ink-muted">Drag to look around · scroll to zoom</span>}
            {!zoomed && arrow('l', prev)}{!zoomed && arrow('r', next)}
            {size.w > 0 && Detail()}
          </div>
          {/* The dinner's card, beside the map so it never covers a station. */}
          <aside className="hidden shrink-0 flex-col items-center justify-start pt-6 pr-6 pl-2 lg:flex"><RampCard view={view} settlement={settlement} audit={audit} limitCents={limit} /></aside>
          </div>
          {run && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-secondary"><b>Checking {run.label.toLowerCase()}</b> · You can leave this page, and it stops when it needs you.</div>}
          {!run && canDecide && mine && !decisionOpen && !zoomed && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-secondary">A decision is waiting. Click the bell to reopen it.</div>}
          {closed && viewing === null && !run && !zoomed && <Link href="/" className={`absolute bottom-6 left-1/2 z-20 -translate-x-1/2 ${primary}`}>Closed, return to dashboard</Link>}
          {showDecision && (
            <div role="dialog" aria-label="Decision" className="absolute top-1/2 left-1/2 z-20 w-140 max-w-[92%] -translate-x-1/2 -translate-y-1/2 border border-ink-primary bg-bg-surface px-5.5 py-5">
              <button aria-label="Close decision" onClick={() => setDecisionOpen(false)} className="absolute top-2 right-3.5 cursor-pointer text-heading leading-none">×</button>
              {Decision()}
              {error && <div role="alert" className="mt-3 text-status-over">{error}</div>}
            </div>
          )}
          {docModel && <DocCard model={docModel} onDoc={openDoc} onBack={() => setDoc(null)} onClose={() => setDoc(null)} />}
        </section>

        <button onClick={() => { setAuditOpen(true); void loadAudit(); }} className="absolute right-5 bottom-3 z-20 flex cursor-pointer gap-3 border border-border bg-bg-surface px-3 py-2 font-strong"><span>Audit log · {audit.length}</span><span>◂</span></button>
        {auditOpen && <aside className="absolute inset-y-0 right-0 z-40 flex w-105 max-w-full flex-col border-l border-ink-primary bg-bg-canvas">
          <div className="flex items-baseline justify-between border-b border-ink-primary px-5 py-3"><h2 className="text-heading font-bold tracking-tight">Audit log<small className="block text-small font-regular tracking-normal text-ink-muted">{audit.length} actions, oldest first. Ask it anything below.</small></h2><button aria-label="Close audit log" onClick={() => setAuditOpen(false)} className="cursor-pointer text-heading leading-none">×</button></div>
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-3">
            {audit.length === 0 && <p className="py-2 text-ink-muted">Actions on this dinner appear here.</p>}
            {audit.map((e) => {
              const open = auditRow === e.id, target = AUDIT_STEP[e.action], check = allChecks.find((c) => c.ruleId === e.ruleId);
              return (
                <div key={e.id}>
                  <button onClick={() => setAuditRow(open ? null : e.id)} aria-expanded={open} className={`block w-full cursor-pointer border-b border-border px-1.5 py-2 text-left ${open ? 'bg-accent-tint' : 'hover:bg-bg-surface'}`}>
                    <span className="flex justify-between text-small text-ink-muted"><b className="font-strong text-ink-primary">{nameOf(e.actorId)}</b><span className="font-mono text-micro">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span></span>
                    <span className="mt-0.5 block">{AUDIT_LABEL[e.action] ?? e.action}</span>
                    {e.detail && e.action !== 'plan.updated' && <span className="mt-0.5 block text-small text-ink-secondary">{e.detail.replace(/(\d+) cents/g, (_, c: string) => usd(Number(c)))}</span>}
                  </button>
                  {open && (
                    <div className="border-b border-border bg-bg-surface px-1.5 py-2 text-small">
                      {([['Date', new Date(e.at).toLocaleString('en-US')], ['Input hash', e.inputHash], ['Rule', e.ruleId ?? 'None']] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-0.5"><span className="text-ink-muted">{k}</span><span className="font-mono text-micro">{v}</span></div>)}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {target !== undefined && target <= step && <button className="cursor-pointer border border-border px-1.5 py-0.5 hover:border-ink-primary" onClick={() => { setViewing(target === step ? null : target); setPicked(null); setAuditOpen(false); }}>Show on the map</button>}
                        {check && <button className="cursor-pointer border border-border px-1.5 py-0.5 hover:border-ink-primary" onClick={() => openDoc(sourceOf(check))}>See the rule</button>}
                        <button className="cursor-pointer border border-border px-1.5 py-0.5 hover:border-ink-primary" onClick={() => setQuestion(`About "${AUDIT_LABEL[e.action] ?? e.action}": `)}>Ask about this</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {chat.map((m, i) => <div key={i} className={`mt-2.5 ${m.role === 'user' ? 'bg-accent-tint px-2.5 py-1.5' : 'text-ink-secondary'}`}>{m.content}</div>)}
            {asking && <div className="mt-2.5 text-ink-muted">Reading the record…</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex gap-1.5 border-t border-border px-5 py-3">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} aria-label="Ask the audit log" placeholder="Ask the audit log why something happened" className="min-w-0 flex-1 border border-border bg-bg-surface px-2.5 py-2" />
            <button disabled={asking || !question.trim()} className="cursor-pointer border border-ink-primary px-3 font-strong disabled:cursor-default disabled:opacity-50">Ask</button>
          </form>
        </aside>}
      </div>
    </div>
  );
}
