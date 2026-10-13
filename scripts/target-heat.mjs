export function beijingClock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

// One contract for straight/group matrices, all positional sizes and kill3.
// Capture only before 21:00. Never accept an undated ranking or a reused issue
// from a different year as an actual pre-draw snapshot.
export function validHeatTimestamp(row, targetIssue, basedOnDate) {
  if (!row) return false;
  const issue = String(targetIssue);
  const year = issue.length === 7 ? issue.slice(0, 4) : `20${issue.slice(0, 2)}`;
  if (String(Number(row.issue)) !== String(Number(issue.slice(-3)))) return false;
  if (!row.date || row.date <= basedOnDate || row.date.slice(0, 4) !== year || row.draw) return false;
  const stamp = new Date(row.capturedAt);
  if (!Number.isFinite(stamp.getTime())) return false;
  const clock = beijingClock(stamp);
  if (clock.date !== row.date || clock.minute < 1220 || clock.minute >= 1260) return false;
  return row.capturedAtBeijing === `${clock.date} ${String(Math.floor(clock.minute/60)).padStart(2,'0')}:${String(clock.minute%60).padStart(2,'0')}`;
}

export function findTargetHeat(payload, targetIssue, basedOnDate) {
  return (payload.preDrawSnapshots ?? []).findLast(row =>
    validHeatTimestamp(row,targetIssue,basedOnDate) && row.rankings?.length === 4 && row.rankings.every(r =>
      Array.isArray(r) && r.length === 10 && [...r].sort((a,b)=>a-b).join('') === '0123456789')
  ) ?? null;
}
