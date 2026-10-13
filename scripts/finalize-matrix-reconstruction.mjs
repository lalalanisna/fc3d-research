import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async f=>JSON.parse(await readFile(path.join(root,f),'utf8'));
const write=async(f,o)=>writeFile(path.join(root,f),JSON.stringify(o,null,2)+'\n');
const cases=[['fc3d','2026271'],['pl3','26271']];
// Freeze every prediction before opening either target result in this process.
const frozen=await Promise.all(cases.map(async([game,issue])=>({game,issue,
  position:await read(`reports/${game}-meta-position-prediction-${issue}.json`),
  kill:await read(`reports/${game}-kill3-prediction-${issue}.json`)})));
for(const f of frozen){
  if(f.position.cutoffDate>=f.position.date||f.kill.basedOnDate>=f.kill.date||f.position.cutoffIssue!==f.kill.basedOnIssue)throw new Error('Prediction cutoff not isolated');
  if(Object.values(f.position.recommendations).some(r=>'draw' in r)||'draw' in f.kill)throw new Error('Frozen artifact unexpectedly contains target result');
}
const archive={phase:'historical-reconstruction',generatedAt:new Date().toISOString(),
  note:'历史热度补算；无昨天20:20抓取时间戳，不计入真实前瞻。原公式及锁定参数保持不变。',
  predictionSha256:createHash('sha256').update(JSON.stringify(frozen)).digest('hex'),frozen};
await write('scripts/data/matrix-reconstruction-20261012-frozen.json',archive);

const positions=await read('scripts/data/meta-position-reconstructions.json');
let kills={};try{kills=await read('scripts/data/matrix-kill3-reconstructions.json');}catch{}
for(const f of frozen){
  const source=await read(`scripts/data/${f.game}-full-history.json`);
  const actual=source.rows.find(r=>String(r.issue)===f.issue);
  if(!actual||actual.date!==f.position.date)throw new Error('Official evaluation result missing');
  positions[f.game]??={};
  for(const [size,prediction]of Object.entries(f.position.recommendations)){
    const row={issue:f.issue,date:actual.date,phase:'historical-reconstruction',basedOnIssue:f.position.cutoffIssue,
      heatIssue:f.position.heatIssue,heatEvidence:'archived-ranking-no-20:20-snapshot',
      predictionSha256:archive.predictionSha256,draw:actual.draw};
    for(const [p,key]of ['hundreds','tens','units'].entries()){
      row[`${key}Pool`]=prediction[`${key}Pool`];
      row[`${key}Hit`]=prediction[`${key}Pool`].includes(actual.draw[p]);
    }
    row.allHit=['hundreds','tens','units'].every(k=>row[`${k}Hit`]);
    const rows=[...(positions[f.game][size]??[]).filter(r=>String(r.issue)!==f.issue),row].sort((a,b)=>a.date.localeCompare(b.date));
    for(const key of ['hundreds','tens','units']){let miss=0;for(const r of rows){miss=r[`${key}Hit`]?0:miss+1;r[`${key}MissStreak`]=miss;}}
    positions[f.game][size]=rows;
  }
  const row={issue:f.issue,date:actual.date,draw:actual.draw,kills:f.kill.kills,
    hit:[...actual.draw].every(d=>!f.kill.kills.includes(d)),phase:'historical-reconstruction',
    basedOnIssue:f.kill.basedOnIssue,predictionSha256:archive.predictionSha256,
    heatEvidence:'archived-ranking-no-20:20-snapshot'};
  kills[f.game]=[...(kills[f.game]??[]).filter(r=>String(r.issue)!==f.issue),row].sort((a,b)=>a.date.localeCompare(b.date));
  let miss=0;for(const r of kills[f.game]){miss=r.hit?0:miss+1;r.missStreak=miss;}
}
await write('scripts/data/meta-position-reconstructions.json',positions);
await write('scripts/data/matrix-kill3-reconstructions.json',kills);
console.log(JSON.stringify({predictionSha256:archive.predictionSha256,records:frozen.map(f=>({game:f.game,issue:f.issue,cutoffIssue:f.position.cutoffIssue}))}));
