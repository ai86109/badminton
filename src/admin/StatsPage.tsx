import { useEffect, useState } from "react";
import { todayIso } from "../logic";
import {
  loadStats,
  type MemberInfo,
  type MemberRank,
  type MonthStat,
  type RankDay,
  type StatsData,
} from "./stats";

const GREEN = "#3f8f57";
const CORAL = "#cc785c";
const CORAL_INK = "#b3523c";
const GREY = "#a89e90";

function mmdd(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${+p[1]}/${+p[2]}` : iso;
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function AdminTopbar({ onGear }: { onGear: () => void }) {
  return (
    <div className="topbar">
      <div className="logo">
        <img src="/admin-apple-touch-icon.png" alt="羽球後台" />
      </div>
      <div>
        <h1>統計</h1>
      </div>
      <button className="gear" onClick={onGear} aria-label="設定" title="設定">
        ⚙️
      </button>
    </div>
  );
}

type Gran = "month" | "quarter" | "year";
const GRAN_LABEL: Record<Gran, string> = { month: "月", quarter: "季", year: "年" };
const BUCKETS_WINDOW = 6;
const BARS_WINDOW = 12;

/** 接受 "YYYY-MM" 或 "YYYY-MM-DD"，回傳該粒度的分組鍵。 */
function periodKey(d: string, g: Gran): string {
  const y = d.slice(0, 4);
  const m = +d.slice(5, 7);
  if (g === "year") return y;
  if (g === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return d.slice(0, 7); // "YYYY-MM"
}
/** 這一頁的 filter 一律直接顯示，不依資料跨度收合。 */
function granOptions(): Gran[] {
  return ["month", "quarter", "year"];
}
interface Bucket {
  key: string;
  year: string;
  income: number;
  expense: number;
  endBalance: number;
}
function bucketize(months: MonthStat[], g: Gran): Bucket[] {
  const map = new Map<string, Bucket>();
  const order: string[] = [];
  months.forEach((m) => {
    const key = periodKey(m.month, g);
    if (!map.has(key)) {
      map.set(key, { key, year: m.month.slice(0, 4), income: 0, expense: 0, endBalance: 0 });
      order.push(key);
    }
    const b = map.get(key)!;
    b.income += m.income;
    b.expense += m.expense;
    b.endBalance = m.endBalance; // months 由舊到新 → 最後一個月的累積結餘＝該期期末
    b.year = m.month.slice(0, 4);
  });
  return order.map((k) => map.get(k)!);
}
function bucketLabel(b: { key: string; year: string }, g: Gran, spanYears: boolean): string {
  if (g === "year") return b.year;
  if (g === "quarter") {
    const q = b.key.slice(-1);
    return spanYears ? `${b.year.slice(2)} Q${q}` : `Q${q}`;
  }
  const mm = +b.key.slice(5, 7);
  return spanYears ? `${b.key.slice(2, 4)}/${mm}` : `${mm}月`;
}

/** 小型 segmented 切換（月／季／年）。 */
function GranToggle({ options, active, onPick }: { options: Gran[]; active: Gran; onPick: (g: Gran) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="lvseg stat-seg">
      {options.map((o) => (
        <button key={o} className={active === o ? "on" : ""} onClick={() => onPick(o)}>
          {GRAN_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

/** 折線圖（面積＋線＋端點值＋期別標籤）。給結餘、平均人數共用。 */
function PeriodLine({ pts, format }: { pts: { label: string; value: number }[]; format: (v: number) => string }) {
  const W = 320,
    padL = 8,
    padR = 40,
    top = 16,
    plotH = 60;
  const baseY = top + plotH;
  const n = pts.length;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const x = (i: number) => (n === 1 ? W / 2 : padL + (i * (W - padL - padR)) / (n - 1));
  const y = (v: number) => baseY - ((v - lo) / (hi - lo)) * plotH;
  const poly = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `M ${x(0)},${baseY} L ${poly.replace(/ /g, " L ")} L ${x(n - 1)},${baseY} Z`;
  return (
    <svg className="stat-svg" viewBox={`0 0 ${W} ${baseY + 22}`} role="img">
      <path d={area} fill={CORAL} opacity={0.1} />
      {n > 1 && <polyline points={poly} fill="none" stroke={CORAL} strokeWidth={2} />}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={3} fill={CORAL} />
          <text className="stat-val" x={x(i)} y={y(p.value) - 7} textAnchor="middle">
            {format(p.value)}
          </text>
          <text className="stat-axis" x={x(i)} y={baseY + 15} textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
function fmtAvg(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const RANK_WINDOW = 12; // 「近 N 場」排行視窗

/** 依所選區間，重算每位成員的到場／分母並排序。 */
function rankFor(days: RankDay[], members: MemberInfo[]): MemberRank[] {
  return members
    .map((m) => {
      let attended = 0;
      let total = 0;
      days.forEach((d) => {
        if (!d.roster.includes(m.id)) return; // 那天他還不是成員 → 不計分母
        total++;
        if (d.present.includes(m.id)) attended++;
      });
      return { id: m.id, name: m.name, level: m.level, attended, total };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.attended - a.attended || b.total - a.total || a.name.localeCompare(b.name));
}

interface RankWin {
  key: string;
  label: string;
  days: RankDay[];
}
/** 小型 segmented 切換（近3個月／今年／全部…）。單一選項時不顯示。 */
function WinToggle({ options, active, onPick }: { options: RankWin[]; active: string; onPick: (k: string) => void }) {
  if (options.length <= 1) return null;
  return (
    <div className="lvseg stat-seg">
      {options.map((o) => (
        <button key={o.key} className={active === o.key ? "on" : ""} onClick={() => onPick(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 每月收支（分歧長條：收入向上、支出向下）＋ 月底結餘折線。可切換 月／季／年。 */
function MoneyCard({ data }: { data: StatsData }) {
  const all = data.monthly; // 全部月份
  const options = granOptions();
  const [gran, setGran] = useState<Gran>(options[0] ?? "month");
  const active = options.includes(gran) ? gran : options[0] ?? "month";

  const view = bucketize(all, active).slice(-BUCKETS_WINDOW);
  const spanYears = new Set(view.map((b) => b.year)).size > 1;
  const ms = view.map((b) => ({
    label: bucketLabel(b, active, spanYears),
    income: b.income,
    expense: b.expense,
    endBalance: b.endBalance,
  }));
  const W = 320;
  return (
    <div className="card">
      <div className="clabel">
        收支與結餘
        <GranToggle options={options} active={active} onPick={setGran} />
      </div>
      {ms.length === 0 ? (
        <div className="stat-empty">尚無收支紀錄。</div>
      ) : (
        <>
          {/* 月底結餘 折線 */}
          <div className="stat-h">月底結餘</div>
          <PeriodLine pts={ms.map((m) => ({ label: m.label, value: m.endBalance }))} format={fmt} />

          {/* 每月收支 分歧長條 */}
          <div className="stat-h" style={{ marginTop: 6 }}>
            每月收支
            <span className="stat-legend">
              <span className="lg"><i style={{ background: GREEN }} />收入</span>
              <span className="lg"><i style={{ background: CORAL_INK }} />支出</span>
            </span>
          </div>
          {(() => {
            const padL = 8,
              padR = 8,
              half = 44,
              top = 14;
            const zeroY = top + half;
            const n = ms.length;
            const slot = (W - padL - padR) / n;
            const barW = Math.min(22, slot * 0.5);
            const maxV = Math.max(1, ...ms.map((m) => Math.max(m.income, m.expense)));
            const hh = half - 14;
            const cx = (i: number) => padL + slot * i + slot / 2;
            return (
              <svg className="stat-svg" viewBox={`0 0 ${W} ${zeroY + half + 6}`} role="img">
                <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#e6dfd8" strokeWidth={1} />
                {ms.map((m, i) => {
                  const ih = (m.income / maxV) * hh;
                  const eh = (m.expense / maxV) * hh;
                  return (
                    <g key={i}>
                      {m.income > 0 && (
                        <rect x={cx(i) - barW / 2} y={zeroY - ih} width={barW} height={ih} rx={3} fill={GREEN} />
                      )}
                      {m.income > 0 && (
                        <text className="stat-val" x={cx(i)} y={zeroY - ih - 4} textAnchor="middle">
                          {fmt(m.income)}
                        </text>
                      )}
                      {m.expense > 0 && (
                        <rect x={cx(i) - barW / 2} y={zeroY} width={barW} height={eh} rx={3} fill={CORAL_INK} />
                      )}
                      {m.expense > 0 && (
                        <text className="stat-val" x={cx(i)} y={zeroY + eh + 11} textAnchor="middle">
                          {fmt(m.expense)}
                        </text>
                      )}
                      <text className="stat-axis" x={cx(i)} y={zeroY + half} textAnchor="middle">
                        {m.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </>
      )}
    </div>
  );
}

/** 出席：每場堆疊長條（已完成場次）＋ 平均每場人數趨勢（可切換 月／季／年）。 */
function AttendCard({ data }: { data: StatsData }) {
  const W = 320;
  const days = data.attendance.slice(-BARS_WINDOW); // 已完成場次，最近 N 場

  // 平均每場人數：用全部已完成場次依期別分組
  const avgOptions = granOptions();
  const [gran, setGran] = useState<Gran>(avgOptions[0] ?? "month");
  const active = avgOptions.includes(gran) ? gran : avgOptions[0] ?? "month";
  const avgMap = new Map<string, { key: string; year: string; sum: number; count: number }>();
  const avgOrder: string[] = [];
  data.attendance.forEach((a) => {
    const key = periodKey(a.date, active);
    if (!avgMap.has(key)) {
      avgMap.set(key, { key, year: a.date.slice(0, 4), sum: 0, count: 0 });
      avgOrder.push(key);
    }
    const b = avgMap.get(key)!;
    b.sum += a.fixed + a.floating;
    b.count++;
  });
  const avgView = avgOrder.map((k) => avgMap.get(k)!).slice(-BUCKETS_WINDOW);
  const avgSpan = new Set(avgView.map((b) => b.year)).size > 1;
  const avgPts = avgView.map((b) => ({ label: bucketLabel(b, active, avgSpan), value: b.sum / b.count }));

  // 堆疊長條的座標
  const padL = 8,
    padR = 8,
    top = 18,
    plotH = 90;
  const baseY = top + plotH;
  const n = days.length;
  const slot = n ? (W - padL - padR) / n : 0;
  const barW = Math.min(22, slot * 0.6);
  const maxT = Math.max(1, ...days.map((d) => d.fixed + d.floating));
  const cx = (i: number) => padL + slot * i + slot / 2;
  const h = (v: number) => (v / maxT) * plotH;

  return (
    <div className="card">
      <div className="clabel">
        出席趨勢
        <span className="stat-legend r">
          <span className="lg"><i style={{ background: CORAL }} />固定</span>
          <span className="lg"><i style={{ background: GREY }} />非固定</span>
        </span>
      </div>
      {data.attendance.length === 0 ? (
        <div className="stat-empty">還沒有已完成的打球日。</div>
      ) : (
        <>
          <div className="stat-h">每場人數</div>
          <svg className="stat-svg" viewBox={`0 0 ${W} ${baseY + 20}`} role="img">
            {days.map((d, i) => {
              const fh = h(d.fixed);
              const gh = h(d.floating);
              const total = d.fixed + d.floating;
              const x = cx(i) - barW / 2;
              const gap = d.fixed > 0 && d.floating > 0 ? 1.5 : 0;
              return (
                <g key={d.date}>
                  {d.fixed > 0 && <rect x={x} y={baseY - fh} width={barW} height={fh} rx={2} fill={CORAL} />}
                  {d.floating > 0 && (
                    <rect x={x} y={baseY - fh - gh - gap} width={barW} height={gh} rx={2} fill={GREY} />
                  )}
                  <text className="stat-val" x={cx(i)} y={baseY - fh - gh - gap - 4} textAnchor="middle">
                    {total}
                  </text>
                  <text className="stat-axis" x={cx(i)} y={baseY + 14} textAnchor="middle">
                    {mmdd(d.date)}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="stat-h" style={{ marginTop: 6 }}>
            平均每場人數
            <GranToggle options={avgOptions} active={active} onPick={setGran} />
          </div>
          <PeriodLine pts={avgPts} format={fmtAvg} />
        </>
      )}
    </div>
  );
}

/** 成員出席排行：橫條（到場次數）＋ 固定/非固定標籤。可切換 近3個月／今年／全部。 */
function RankCard({ data }: { data: StatsData }) {
  const yearCut = `${todayIso().slice(0, 4)}-01-01`;
  const all = data.rankDays;
  const options: RankWin[] = [
    { key: "recent", label: `近${RANK_WINDOW}場`, days: all.slice(-RANK_WINDOW) },
    { key: "year", label: "今年", days: all.filter((d) => d.date >= yearCut) },
    { key: "all", label: "全部", days: all },
  ];
  const [win, setWin] = useState("recent");
  const active = options.find((o) => o.key === win) ?? options[0];

  const rows = rankFor(active.days, data.members);
  const maxA = Math.max(1, ...rows.map((r) => r.attended));
  return (
    <div className="card">
      <div className="clabel">
        成員出席排行
        <WinToggle options={options} active={win} onPick={setWin} />
      </div>
      {rows.length === 0 ? (
        <div className="stat-empty">還沒有出席資料。</div>
      ) : (
        <div className="rank-list">
          {rows.map((r) => (
            <div className="rank-row" key={r.id}>
              <div className="rank-head">
                <span className="rank-name">{r.name}</span>
                <span className={"lvtag " + (r.level === "fixed" ? "fixed" : "")}>
                  {r.level === "fixed" ? "固定" : "非固定"}
                </span>
                <span className="rank-fig num">
                  {r.attended}
                  <small>/{r.total}</small>
                </span>
              </div>
              <div className="rank-track">
                <div className="rank-fill" style={{ width: `${(r.attended / maxA) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatsView({ data }: { data: StatsData }) {
  return (
    <div className="screen">
      <MoneyCard data={data} />
      <AttendCard data={data} />
      <RankCard data={data} />
    </div>
  );
}

export default function StatsPage({ onGear }: { onGear: () => void }) {
  const [data, setData] = useState<StatsData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadStats()
      .then(setData)
      .catch(() => setErr("讀取失敗，請檢查網路後重新整理。"));
  }, []);

  return (
    <>
      <AdminTopbar onGear={onGear} />
      {err ? (
        <div className="screen">
          <div className="stat-empty">{err}</div>
        </div>
      ) : !data ? (
        <div className="screen">
          <div className="stat-empty">載入中…</div>
        </div>
      ) : (
        <StatsView data={data} />
      )}
    </>
  );
}
