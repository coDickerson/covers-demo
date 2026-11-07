// HTML receipt templates. Each returns a full document whose `.receipt` element is screenshotted.
// Four layouts: thermal (narrow monospace), upscale (serif, itemized), bartab (sans, tab with times),
// handwritten (printed slip; tip and total written in a script font).
import type { ReceiptSpec, SpecItem, Template } from './schema';
import { fmt, preTipCents, subtotalCents } from './truth';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SCRIPT_FONT = `'Bradley Hand', 'Noteworthy', 'Marker Felt', 'Segoe Script', 'Comic Sans MS', cursive`;

/** Deterministic 4-digit "card" suffix from the check number. */
function cardLast4(spec: ReceiptSpec): string {
  let h = 7;
  for (const ch of spec.id) h = (h * 31 + ch.charCodeAt(0)) % 10000;
  return String(h).padStart(4, '0');
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function doc(css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;padding:0;display:inline-block}
.receipt{background:#fff;color:#111}
.row{display:flex;justify-content:space-between;gap:8px}
.row .l{flex:1;min-width:0;overflow-wrap:anywhere}
.row .r{white-space:nowrap;text-align:right}
.center{text-align:center}
${css}
</style></head><body>${body}</body></html>`;
}

function itemRows(items: SpecItem[], opts: { qtyStyle: 'prefix' | 'column' | 'x'; upper?: boolean }): string {
  return items
    .map((i) => {
      const text = esc(i.text);
      const q = i.qty ?? 1;
      const label =
        opts.qtyStyle === 'column'
          ? `<span class="q">${i.qty ? q : ''}</span><span class="t">${text}</span>`
          : opts.qtyStyle === 'x'
            ? `${i.qty && q > 1 ? `${q}x ` : ''}${text}`
            : `${i.qty ? `${q} ` : ''}${text}`;
      const note = i.note ? `<div class="note">${esc(i.note)}</div>` : '';
      return `<div class="row item"><span class="l">${label}</span><span class="r">${fmt(i.amountCents)}</span></div>${note}`;
    })
    .join('');
}

function chargeRows(spec: ReceiptSpec, withTip: boolean): string {
  const rows = [
    `<div class="row sub"><span class="l">Subtotal</span><span class="r">${fmt(subtotalCents(spec))}</span></div>`,
    ...spec.fees.map((f) => `<div class="row"><span class="l">${esc(f.text)}</span><span class="r">${fmt(f.amountCents)}</span></div>`),
    ...spec.taxes.map((t) => `<div class="row"><span class="l">${esc(t.text)}</span><span class="r">${fmt(t.amountCents)}</span></div>`),
  ];
  if (withTip && spec.tip)
    rows.push(`<div class="row"><span class="l">${esc(spec.tip.text)}</span><span class="r">${fmt(spec.tip.amountCents)}</span></div>`);
  return rows.join('');
}

function footer(spec: ReceiptSpec): string {
  return spec.footer.map((f) => `<div class="foot">${esc(f)}</div>`).join('');
}

function thermal(spec: ReceiptSpec): string {
  const r = spec.restaurant;
  const css = `
.receipt{width:300px;padding:18px 14px 26px;font-family:'Menlo','Courier New',monospace;font-size:12px;line-height:1.45;color:#222}
.name{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
.hr{border-top:1px dashed #555;margin:7px 0}
.note{padding-left:22px;font-size:11px;color:#444}
.total{font-weight:700;font-size:14px}
.foot{text-align:center;margin-top:6px;font-size:11px}
.meta{font-size:11px}`;
  const body = `<div class="receipt">
<div class="center name">${esc(r.name)}</div>
${r.address.map((a) => `<div class="center">${esc(a)}</div>`).join('')}
${r.phone ? `<div class="center">${esc(r.phone)}</div>` : ''}
<div class="hr"></div>
<div class="row meta"><span>CHK ${esc(spec.check)}</span><span>${prettyDate(spec.date)} ${spec.time}</span></div>
<div class="row meta"><span>SERVER: ${esc(spec.server.toUpperCase())}</span><span>${spec.table ? `TBL ${esc(spec.table)}` : ''}</span></div>
${spec.printedCovers ? `<div class="meta">GUESTS: ${spec.printedCovers}</div>` : ''}
<div class="hr"></div>
${itemRows(spec.items, { qtyStyle: 'prefix' })}
<div class="hr"></div>
${chargeRows(spec, true)}
<div class="hr"></div>
<div class="row total"><span>TOTAL</span><span>${fmt(spec.totalCents)}</span></div>
<div class="row meta"><span>VISA XXXXXXXXXXXX${cardLast4(spec)}</span><span>${fmt(spec.totalCents)}</span></div>
<div class="hr"></div>
${footer(spec)}
<div class="foot">*** CUSTOMER COPY ***</div>
</div>`;
  return doc(css, body);
}

function upscale(spec: ReceiptSpec): string {
  const r = spec.restaurant;
  const css = `
.receipt{width:460px;padding:36px 34px 40px;font-family:'Baskerville','Georgia','Times New Roman',serif;font-size:15px;line-height:1.55;color:#1d1d1d}
.name{font-size:24px;letter-spacing:4px;text-transform:uppercase}
.addr{font-size:12px;letter-spacing:1px;color:#555}
.rule{border-top:1px solid #999;margin:14px 0}
.meta{font-size:12px;color:#444;display:flex;justify-content:space-between}
.item .q{display:inline-block;width:26px;color:#555}
.note{padding-left:26px;font-size:12px;font-style:italic;color:#666}
.sub{margin-top:2px}
.total{font-size:18px;font-weight:700;letter-spacing:1px}
.foot{text-align:center;margin-top:10px;font-size:12px;font-style:italic;color:#555}`;
  const body = `<div class="receipt">
<div class="center name">${esc(r.name)}</div>
<div class="center addr">${r.address.map(esc).join(' · ')}${r.phone ? ` · ${esc(r.phone)}` : ''}</div>
<div class="rule"></div>
<div class="meta"><span>Server ${esc(spec.server)}</span><span>Table ${esc(spec.table ?? '—')}</span><span>${spec.printedCovers ? `Covers ${spec.printedCovers}` : ''}</span></div>
<div class="meta"><span>Check #${esc(spec.check)}</span><span>${prettyDate(spec.date)} ${spec.time}</span></div>
<div class="rule"></div>
${itemRows(spec.items, { qtyStyle: 'column' })}
<div class="rule"></div>
${chargeRows(spec, true)}
<div class="rule"></div>
<div class="row total"><span>Total</span><span>$${fmt(spec.totalCents)}</span></div>
<div class="meta" style="margin-top:6px"><span>Visa ending ${cardLast4(spec)}</span><span>Approved</span></div>
${footer(spec)}
</div>`;
  return doc(css, body);
}

function bartab(spec: ReceiptSpec): string {
  const r = spec.restaurant;
  const [hh, rest] = spec.time.split(':');
  const startH = Number(hh);
  const startM = Number(rest!.slice(0, 2));
  const stamp = (n: number) => {
    // items are rung in ~11 minutes apart, going backwards from close time
    const mins = startH * 60 + startM - (spec.items.length - n) * 11;
    const h = ((Math.floor(mins / 60) + 11) % 12) + 1;
    return `${h}:${String(((mins % 60) + 60) % 60).padStart(2, '0')}`;
  };
  const css = `
.receipt{width:340px;padding:20px 18px 28px;font-family:'Helvetica Neue','Arial',sans-serif;font-size:13px;line-height:1.5;color:#111}
.name{font-size:20px;font-weight:800;letter-spacing:-.5px}
.tab{font-size:28px;font-weight:800;text-align:center;border:3px solid #111;margin:10px 0;padding:2px 0}
.small{font-size:11px;color:#333}
.hr{border-top:2px solid #111;margin:8px 0}
.item .ts{font-size:10px;color:#666;width:34px;display:inline-block}
.note{padding-left:34px;font-size:11px;color:#555}
.total{font-size:18px;font-weight:800}
.foot{text-align:center;margin-top:6px;font-size:11px}`;
  const items = spec.items
    .map((i, n) => {
      const label = `<span class="ts">${stamp(n)}</span>${i.qty && i.qty > 1 ? `${i.qty}x ` : ''}${esc(i.text)}`;
      const note = i.note ? `<div class="note">${esc(i.note)}</div>` : '';
      return `<div class="row item"><span class="l">${label}</span><span class="r">${fmt(i.amountCents)}</span></div>${note}`;
    })
    .join('');
  const body = `<div class="receipt">
<div class="name">${esc(r.name)}</div>
<div class="small">${r.address.map(esc).join(', ')}</div>
<div class="tab">${esc(spec.check)}</div>
<div class="row small"><span>Bartender: ${esc(spec.server)}</span><span>${prettyDate(spec.date)}</span></div>
<div class="row small"><span>Closed ${spec.time}</span><span>${spec.printedCovers ? `Guests ${spec.printedCovers}` : ''}</span></div>
<div class="hr"></div>
${items}
<div class="hr"></div>
${chargeRows(spec, true)}
<div class="hr"></div>
<div class="row total"><span>TAB TOTAL</span><span>${fmt(spec.totalCents)}</span></div>
<div class="small">Card on file ••${cardLast4(spec)}</div>
${footer(spec)}
<div class="foot">Drink responsibly. Tip your bartender.</div>
</div>`;
  return doc(css, body);
}

function handwritten(spec: ReceiptSpec): string {
  const r = spec.restaurant;
  const css = `
.receipt{width:340px;padding:20px 18px 30px;font-family:'Courier New','Courier',monospace;font-size:13px;line-height:1.45;color:#222}
.name{font-size:16px;font-weight:700}
.hr{border-top:1px dashed #666;margin:8px 0}
.note{padding-left:20px;font-size:11px}
.slip{margin-top:6px;font-size:14px}
.slip .row{align-items:flex-end;margin-top:10px}
.blank{flex:0 0 150px;border-bottom:1px solid #333;text-align:right;position:relative;height:26px}
.ink{font-family:${SCRIPT_FONT};color:#1b2f8a;font-size:24px;position:absolute;right:8px;bottom:-2px;transform:rotate(-3deg)}
.sig{height:44px;border-bottom:1px solid #333;margin-top:12px;position:relative}
.sig .ink{left:20px;right:auto;bottom:2px;font-size:28px;transform:rotate(-6deg)}
.foot{text-align:center;margin-top:8px;font-size:11px}`;
  const tip = spec.tip;
  const signer = 'Jordan Lee'; // the rep signs
  const body = `<div class="receipt">
<div class="center name">${esc(r.name)}</div>
${r.address.map((a) => `<div class="center">${esc(a)}</div>`).join('')}
<div class="hr"></div>
<div class="row"><span>Server: ${esc(spec.server)}</span><span>Check ${esc(spec.check)}</span></div>
<div class="row"><span>Table ${esc(spec.table ?? '')}</span><span>${spec.printedCovers ? `Guests ${spec.printedCovers}` : ''}</span></div>
<div>${prettyDate(spec.date)} ${spec.time}</div>
<div class="hr"></div>
${itemRows(spec.items, { qtyStyle: 'prefix' })}
<div class="hr"></div>
${chargeRows(spec, false)}
<div class="row" style="font-weight:700;margin-top:4px"><span class="l">Amount</span><span class="r">${fmt(preTipCents(spec))}</span></div>
<div class="hr"></div>
<div class="slip">
<div class="row"><span>${esc(tip?.text ?? 'Tip')}:</span><span class="blank">${tip ? `<span class="ink">${fmt(tip.amountCents)}</span>` : ''}</span></div>
<div class="row"><span>Total:</span><span class="blank"><span class="ink">${fmt(spec.totalCents)}</span></span></div>
<div class="sig"><span class="ink">${signer}</span></div>
<div class="center" style="font-size:11px">I agree to pay the above total amount</div>
</div>
${footer(spec)}
<div class="foot">VISA ************${cardLast4(spec)} — MERCHANT COPY</div>
</div>`;
  return doc(css, body);
}

const RENDERERS: Record<Template, (s: ReceiptSpec) => string> = { thermal, upscale, bartab, handwritten };

export function renderHtml(spec: ReceiptSpec): string {
  return RENDERERS[spec.template](spec);
}
