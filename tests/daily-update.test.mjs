import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGame} from '../scripts/check-daily-update.mjs';
function fixture(locked=false) {
  const r={targetIssue:'2026269',basedOnIssue:'2026268',basedOnDate:'2026-10-09'};
  const snapshot=locked?{issue:'269',date:'2026-10-10',capturedAt:'2026-10-10T12:20:00Z',capturedAtBeijing:'2026-10-10 20:20'}:null;
  return {data:{recommendation:r},heat:{matrix22:{...r,numbers:locked?Array(22).fill('123'):[],heatSnapshot:snapshot},matrix22Coverage:{...r,numbers:locked?Array(22).fill('123'):[],heatSnapshot:snapshot}},meta:{pools:Object.fromEntries([5,6,7].map(s=>[s,{targetIssue:r.targetIssue,recommendation:locked?{...r,heatMode:'target-locked',heatCapturedAt:snapshot.capturedAtBeijing}:null}]))},kill:{...r,recommendation:locked?{...r,kills:'789',heatCapturedAt:snapshot.capturedAtBeijing}:null}};
}
test('before heat time a pending recommendation is normal',()=>assert.equal(checkGame(fixture(),new Date('2026-10-10T12:10:00Z')).ok,true));
test('real pending positioning schema uses the top-level target issue',()=>{
  const f=fixture();f.meta.targetIssue='2026269';
  for(const pool of Object.values(f.meta.pools))delete pool.targetIssue;
  assert.equal(checkGame(f,new Date('2026-10-10T12:10:00Z')).ok,true);
});
test('evening missing heat is visible as a failed health check',()=>assert.equal(checkGame(fixture(),new Date('2026-10-10T13:10:00Z')).ok,false));
test('both games share the same synchronization contract',()=>{
  const f=fixture(true);assert.equal(checkGame(f,new Date('2026-10-10T12:30:00Z')).ok,true);
  f.meta.pools[7].recommendation.basedOnIssue='2026267';
  assert.equal(checkGame(f,new Date('2026-10-10T12:30:00Z')).ok,false);
});
test('missing heat is reported by 20:25 rather than 20:50',()=>assert.equal(checkGame(fixture(),new Date('2026-10-10T12:25:00Z')).ok,false));
test('publish check never accepts partial readiness, even before deadline',()=>assert.equal(checkGame(fixture(),new Date('2026-10-10T12:21:00Z'),{requireReady:true}).ok,false));
test('same issue is insufficient when modules used different captures',()=>{
  const f=fixture(true);f.kill.recommendation.heatCapturedAt='2026-10-10 20:30';
  assert.equal(checkGame(f,new Date('2026-10-10T12:30:00Z')).ok,false);
});
test('post-draw and next-morning stale official data are never silently successful',()=>{
  assert.equal(checkGame(fixture(true),new Date('2026-10-10T15:10:00Z')).ok,false);
  assert.equal(checkGame(fixture(),new Date('2026-10-10T23:10:00Z')).ok,false);
});
