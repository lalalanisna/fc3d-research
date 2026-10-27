import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditHistory,checkGame} from '../scripts/check-daily-update.mjs';
const read=async f=>JSON.parse(await readFile(new URL('../'+f,import.meta.url),'utf8'));
test('historical gaps remain visible without inventing real forward records',()=>{
  const data={recommendation:{basedOnDate:'2026-10-26'},history:[{issue:'2026285',date:'2026-10-26'}]};
  const input={data,heat:{matrix22:{replayRows:data.history},matrix22Coverage:{replayRows:data.history}},meta:{pools:{}},kill:{}};
  let result=auditHistory(input)[0];
  assert.equal(result.modules.position7,'missing');
  input.meta.pools[7]={reconstructionHistory:data.history};
  result=auditHistory(input)[0];
  assert.equal(result.modules.position7,'reconstructed');
  assert.equal(result.modules.straight,'historical-replay');
});
test('October 26 predictions were frozen with prior-issue cutoff, then evaluated separately',async()=>{
  const archive=await read('scripts/data/matrix-reconstruction-20261026-frozen.json');
  assert.equal(archive.predictionSha256,createHash('sha256').update(JSON.stringify(archive.frozen)).digest('hex'));
  for(const f of archive.frozen){
    assert.equal(f.position.cutoffDate,'2026-10-25');
    assert.equal(f.kill.basedOnDate,'2026-10-25');
    assert.equal(f.position.cutoffIssue,f.kill.basedOnIssue);
    assert.ok(!Object.hasOwn(f.kill,'draw'));
    const prefix=f.game==='pl3'?'pl3-':'';
    const [meta,kill,source]=await Promise.all([read(`pages/${prefix}meta-position-data.json`),read(`pages/${prefix}matrix-kill3-dynamic-data.json`),read(`scripts/data/${f.game}-full-history.json`)]);
    const actual=source.rows.find(r=>String(r.issue)===f.issue);
    for(const size of [5,6,7]){
      const pool=meta.pools[size];
      assert.ok(!pool.history.some(r=>String(r.issue)===f.issue));
      const row=pool.reconstructionHistory.find(r=>String(r.issue)===f.issue);
      assert.equal(row.phase,'historical-reconstruction');
      assert.equal(row.predictionSha256,archive.predictionSha256);
      assert.equal(row.draw,actual.draw);
      for(const [p,key] of ['hundreds','tens','units'].entries()){
        assert.ok(!Object.hasOwn(f.position.recommendations[size],'draw'));
        assert.equal(row[key+'Pool'],f.position.recommendations[size][key+'Pool']);
        assert.equal(row[key+'Hit'],row[key+'Pool'].includes(actual.draw[p]));
        assert.equal(row[key+'MissStreak'],null);
      }
    }
    assert.ok(!kill.forwardHistory.some(r=>String(r.issue)===f.issue));
    const row=kill.reconstructionHistory.find(r=>String(r.issue)===f.issue);
    assert.equal(row.kills,f.kill.kills);
    assert.equal(row.hit,[...actual.draw].every(d=>!row.kills.includes(d)));
    assert.equal(row.missStreak,null);
    const [data,heat]=await Promise.all([read(`pages/${prefix}data.json`),read(`pages/${prefix}heat-data.json`)]);
    const checked=checkGame({data,heat,meta,kill},new Date('2026-10-27T12:35:00Z'));
    // Fixed historical time only tests completeness; later daily data can advance.
    assert.ok(checked.warnings.some(w=>w.includes('2026-10-26')&&w.includes('reconstructed')) || !checked.historyAudit.some(r=>r.date==='2026-10-26'));
    const isolated=auditHistory({heat,meta,kill,data:{...data,history:[{issue:f.issue,date:'2026-10-26'}]}});
    for(const mod of Object.values(isolated[0].modules))assert.notEqual(mod,'missing');
  }
});
