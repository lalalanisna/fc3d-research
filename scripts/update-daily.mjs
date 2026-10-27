import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beijingClock,findTargetHeat} from './target-heat.mjs';
import {checkGame} from './check-daily-update.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modeIndex=process.argv.indexOf('--mode');
const mode=modeIndex<0?'auto':process.argv[modeIndex+1];
const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const run=(file,env={})=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'scripts',file)],{cwd:root,env:{...process.env,...env},stdio:'inherit'});
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(new Error(`${file} ${env.LOTTERY_GAME??'fc3d'} exited ${code}`)));
});
const games=[['fc3d',''],['pl3','pl3-']];
const yesterday=date=>new Date(Date.parse(`${date}T12:00:00Z`)-86400000).toISOString().slice(0,10);
async function generateMatrices(game){
  for(const file of ['generate-position-meta-data.mjs','generate-heat-module-data.mjs','generate-matrix-kill3-dynamic.mjs'])await run(file,{LOTTERY_GAME:game});
}
async function checkLocal(requireReady=false){
  for(const [game,prefix] of games){
    const [data,heat,meta,kill]=await Promise.all(['data.json','heat-data.json','meta-position-data.json','matrix-kill3-dynamic-data.json'].map(f=>read(`pages/${prefix}${f}`)));
    const result=checkGame({data,heat,meta,kill},new Date(),{requireReady});
    console.log(JSON.stringify({game,...result}));
    if(!result.ok)throw new Error(`${game}: ${result.issues.join('; ')}`);
  }
}
async function evening(){
  let clock=beijingClock();
  if(clock.minute<1155||clock.minute>=1260)throw new Error('Evening capture must run between 19:15 and 20:59 Beijing');
  // Pre-warm rather than allocate a cold runner at the exact capture minute.
  while(clock.minute<1220){
    console.log(`Cloud runner ready: ${clock.date} minute ${clock.minute}; waiting for 20:20`);
    await new Promise(resolve=>setTimeout(resolve,30000));clock=beijingClock();
  }
  for(const [game,prefix] of games){
    const [base,source]=await Promise.all([read(`pages/${prefix}data.json`),read(`scripts/data/${game}-full-history.json`)]);
    const last=source.rows.at(-1);
    if(base.recommendation?.basedOnDate!==yesterday(clock.date)||last?.date!==yesterday(clock.date)||String(base.recommendation.basedOnIssue)!==String(last.issue))throw new Error(`${game}: previous draw and base models are not ready; run the full refresh first`);
  }
  async function ready(game,prefix){
    const [base,heat]=await Promise.all([read(`pages/${prefix}data.json`),read(`scripts/data/${game}-17500-heat.json`)]);
    return findTargetHeat(heat,base.recommendation.targetIssue,base.recommendation.basedOnDate)?.date===clock.date;
  }
  let complete=false;
  while(beijingClock().date===clock.date&&beijingClock().minute<1260){
    const outcomes=await Promise.allSettled(games.map(async([game,prefix])=>{
      if(!await ready(game,prefix))await run('fetch-17500-heat.mjs',{LOTTERY_GAME:game});
      if(!await ready(game,prefix))throw new Error(`${game}: current-issue heat not available yet`);
    }));
    if(outcomes.every(r=>r.status==='fulfilled')){complete=true;break;}
    for(const r of outcomes)if(r.status==='rejected')console.error(r.reason.message);
    await new Promise(resolve=>setTimeout(resolve,20000));
  }
  if(!complete)throw new Error('Current-issue heat missing; no partial dual-game recommendation will be published');
  await Promise.all(games.map(([game])=>generateMatrices(game)));
  await checkLocal(true);
}
async function full(){
  const heatRuns=await Promise.allSettled(games.map(([game])=>run('fetch-17500-heat.mjs',{LOTTERY_GAME:game})));
  for(const r of heatRuns)if(r.status==='rejected')console.warn(r.reason.message);
  await run('generate-v7-static-data.mjs');
  await run('fetch-pl3-history.mjs');
  await run('generate-v7-static-data.mjs',{LOTTERY_GAME:'pl3'});
  for(const [game] of games){
    for(const variant of ['legacy','joint','trustworthy'])await run('generate-position-pools-static-data.mjs',{LOTTERY_GAME:game,POSITION_MODEL:variant});
    await run('generate-kill3-static-data.mjs',{LOTTERY_GAME:game});
  }
  await run('generate-v9-static-data.mjs');
  await run('generate-v9-static-data.mjs',{V9_VARIANT:'v9-2',V9_CONFIG_NAME:'v9-2-low-hit-config.json',V9_RESULT_NAME:'v9-2-low-hit-training.json'});
  await Promise.all(games.map(([game])=>generateMatrices(game)));
  await checkLocal();
}
const clock=beijingClock();
if(mode==='evening'||(mode==='auto'&&clock.minute>=1155&&clock.minute<1260))await evening();
else if(mode==='auto'||mode==='full')await full();
else if(mode==='matrix-only'){await Promise.all(games.map(([game])=>generateMatrices(game)));await checkLocal();}
else throw new Error(`Unknown update mode: ${mode}`);
