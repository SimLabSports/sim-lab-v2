import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {impliedProbability,marketFavorite,isStale,hasVerifiedAlignment,getBook,matchesCategory,evaluateMarketAlignment} from '../src/lib/markets.ts';

test('American prices convert to raw implied percentages without inventing model probabilities',()=>{
  assert.equal(impliedProbability(100),50);
  assert.equal(impliedProbability(-400),80);
  assert.equal(impliedProbability(300),25);
  for(const invalid of [0,20,-20,NaN,Infinity])assert.equal(impliedProbability(invalid),null);
});
test('market favorite supports under-50 percent selections and soccer draws',()=>{
  assert.equal(marketFavorite({key:'h2h',outcomes:[{name:'Away',price:180},{name:'Home',price:200},{name:'Draw',price:150}]}),'Draw');
  assert.equal(marketFavorite({key:'h2h',outcomes:[{name:'Away',price:-110},{name:'Home',price:-110}]}),null);
  assert.equal(marketFavorite({key:'spreads',outcomes:[{name:'Away',price:-115},{name:'Home',price:-105}]}),null);
  assert.equal(marketFavorite({key:'h2h',outcomes:[{name:'Away',price:0},{name:'Home',price:150}]}),null);
  assert.equal(marketFavorite(undefined),null);
});
test('missing, stale, disagreeing or incomplete independent inputs cannot yield 3/3',()=>{
  const valid={selection:'Home',available:true,stale:false};
  assert.equal(hasVerifiedAlignment([valid,valid,valid]),true);
  for(const missing of [{...valid,selection:null},{...valid,available:false},{...valid,stale:true},{...valid,selection:'Away'}]){
    assert.equal(hasVerifiedAlignment([valid,missing,valid]),false);
  }
  assert.equal(hasVerifiedAlignment([valid]),false);
  assert.equal(hasVerifiedAlignment([]),false);
});
test('quote freshness requires a valid original source timestamp',()=>{
  const now=Date.parse('2026-10-19T17:00:00Z');
  assert.equal(isStale('2026-10-19T16:59:00Z',now),false);
  assert.equal(isStale('2026-10-19T16:40:00Z',now),true);
  assert.equal(isStale('2026-10-20T16:59:00Z',now),true);
  assert.equal(isStale(null,now),true);
  assert.equal(isStale('invalid',now),true);
});
test('a missing Fanatics market never substitutes another bookmaker',()=>{
  assert.equal(getBook({bookmakers:[{key:'other',title:'Other',markets:[]}]}),undefined);
});
test('active alignment evaluates real markets without filling missing perspectives',()=>{
  const event={bookmakers:[{key:'fanatics',last_update:'2026-10-19T17:00:00Z',markets:[{key:'h2h',last_update:'2026-10-19T17:00:00Z',outcomes:[{name:'Home',price:-150},{name:'Away',price:130}]}]}]};
  const fresh=evaluateMarketAlignment(event,'h2h',Date.parse('2026-10-19T17:01:00Z'));
  assert.equal(fresh.evaluated,1);
  assert.equal(fresh.selection,'Home');
  assert.equal(fresh.implied,60);
  assert.equal(fresh.aligned,false);
  assert.equal(fresh.perspectives[1].selection,null);
  assert.equal(fresh.perspectives[2].selection,null);
  const stale=evaluateMarketAlignment(event,'h2h',Date.parse('2026-10-19T17:20:00Z'));
  assert.equal(stale.evaluated,0);
  assert.equal(stale.status,'Stale market');
  assert.equal(stale.aligned,false);
  const spread=evaluateMarketAlignment(event,'spreads',Date.parse('2026-10-19T17:01:00Z'));
  assert.equal(spread.selection,null);
  assert.equal(spread.evaluated,0);
});
test('league category includes corresponding futures without crossing sports',()=>{
  assert.equal(matchesCategory({title:'NBA Championship Winner',group:'Basketball',key:'basketball_nba_championship_winner'},'NBA'),true);
  assert.equal(matchesCategory({title:'NCAAF',group:'American Football',key:'americanfootball_ncaaf'},'NFL'),false);
  assert.equal(matchesCategory({title:'EPL',group:'Soccer',key:'soccer_epl'},'Soccer'),true);
});
