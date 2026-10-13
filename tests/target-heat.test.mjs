import test from 'node:test';
import assert from 'node:assert/strict';
import {findTargetHeat} from '../scripts/target-heat.mjs';
const sample=()=>({issue:'272',date:'2026-10-13',capturedAt:'2026-10-13T12:20:05Z',capturedAtBeijing:'2026-10-13 20:20',rankings:Array.from({length:4},()=>[0,1,2,3,4,5,6,7,8,9])});
const check=(r,issue='2026272')=>findTargetHeat({preDrawSnapshots:[r]},issue,'2026-10-12');
test('all modules accept the same actual 20:20 snapshot for either game',()=>{
  assert.ok(check(sample()));assert.ok(check(sample(),'26272'));
});
test('late snapshot, previous year, previous day and incomplete ranks are rejected',()=>{
  for(const change of [
    {capturedAt:'2026-10-13T13:10:00Z',capturedAtBeijing:'2026-10-13 21:10'},
    {date:'2025-10-13'}, {date:'2026-10-12'}, {rankings:[]}, {draw:'123'},
    {capturedAt:null}, {capturedAtBeijing:'2026-10-13 20:30'},
  ])assert.equal(check({...sample(),...change}),null);
});
