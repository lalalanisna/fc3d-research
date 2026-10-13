import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async f=>JSON.parse(await readFile(new URL('../'+f,import.meta.url),'utf8'));
test('yesterday reconstructions retain frozen answer-free inputs and stay outside forward metrics',async()=>{
  const archive=await read('scripts/data/matrix-reconstruction-20261012-frozen.json');
  assert.equal(createHash('sha256').update(JSON.stringify(archive.frozen)).digest('hex'),archive.predictionSha256);
  for(const f of archive.frozen){
    const prefix=f.game==='pl3'?'pl3-':'';
    assert.equal(f.position.cutoffDate,'2026-10-11');assert.equal(f.kill.basedOnDate,'2026-10-11');
    assert.ok(!('draw' in f.kill));
    const meta=await read(`pages/${prefix}meta-position-data.json`);
    for(const [size,prediction]of Object.entries(f.position.recommendations)){
      assert.ok(!('draw' in prediction));
      assert.ok(!meta.pools[size].history.some(r=>String(r.issue)===f.issue));
      const row=meta.pools[size].reconstructionHistory.find(r=>String(r.issue)===f.issue);
      assert.equal(row.predictionSha256,archive.predictionSha256);
      for(const key of ['hundreds','tens','units'])assert.equal(row[`${key}Pool`],prediction[`${key}Pool`]);
    }
    const kill=await read(`pages/${prefix}matrix-kill3-dynamic-data.json`);
    assert.ok(!kill.forwardHistory.some(r=>String(r.issue)===f.issue));
    assert.equal(kill.reconstructionHistory.find(r=>String(r.issue)===f.issue).kills,f.kill.kills);
  }
});
