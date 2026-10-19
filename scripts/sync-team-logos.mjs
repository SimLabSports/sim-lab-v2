import fs from 'node:fs/promises';
import path from 'node:path';
if(!process.env.ODDS_API_KEY)throw new Error('ODDS_API_KEY must be configured to synchronize logos against current provider events.');
const leagues={americanfootball_nfl:'football/nfl',americanfootball_ncaaf:'football/college-football',basketball_nba:'basketball/nba',basketball_wnba:'basketball/wnba',basketball_euroleague:'basketball/euroleague',baseball_mlb:'baseball/mlb',icehockey_nhl:'hockey/nhl',soccer_epl:'soccer/eng.1',soccer_efl_champ:'soccer/eng.2',soccer_england_league1:'soccer/eng.3',soccer_england_league2:'soccer/eng.4',soccer_england_efl_cup:'soccer/eng.league_cup',soccer_spain_la_liga:'soccer/esp.1',soccer_spain_segunda_division:'soccer/esp.2',soccer_italy_serie_a:'soccer/ita.1',soccer_italy_serie_b:'soccer/ita.2',soccer_germany_bundesliga:'soccer/ger.1',soccer_germany_bundesliga2:'soccer/ger.2',soccer_germany_dfb_pokal:'soccer/ger.dfb_pokal',soccer_france_ligue_one:'soccer/fra.1',soccer_france_ligue_two:'soccer/fra.2',soccer_usa_mls:'soccer/usa.1',soccer_uefa_champs_league:'soccer/uefa.champions',soccer_uefa_europa_league:'soccer/uefa.europa',soccer_netherlands_eredivisie:'soccer/ned.1',soccer_portugal_primeira_liga:'soccer/por.1',soccer_mexico_ligamx:'soccer/mex.1',soccer_brazil_campeonato:'soccer/bra.1',soccer_argentina_primera_division:'soccer/arg.1',soccer_australia_aleague:'soccer/aus.1',soccer_japan_j_league:'soccer/jpn.1',soccer_turkey_super_league:'soccer/tur.1',soccer_belgium_first_div:'soccer/bel.1',soccer_spl:'soccer/sco.1',soccer_saudi_arabia_pro_league:'soccer/ksa.1'};
const normalize=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={'Internazionale':'Inter Milan','Athletic Club':'Athletic Bilbao','Atlético Madrid':'Atletico Madrid','Real Betis':'Real Betis Balompié','Sporting CP':'Sporting Lisbon','FC Cologne':'FC Köln','Bayern Munich':'Bayern München'};
const identities={};const failures=[];let downloads=0;
await fs.mkdir('public/team-logos',{recursive:true});
const jobs=Object.entries(leagues);
for(let i=0;i<jobs.length;i+=5){await Promise.all(jobs.slice(i,i+5).map(async([key,league])=>{
  try{
    const oddsUrl=new URL(`https://api.the-odds-api.com/v4/sports/${key}/odds`);
    oddsUrl.searchParams.set('apiKey',process.env.ODDS_API_KEY);oddsUrl.searchParams.set('bookmakers','fanatics');oddsUrl.searchParams.set('markets','h2h');oddsUrl.searchParams.set('oddsFormat','american');
    const odds=await fetch(oddsUrl,{signal:AbortSignal.timeout(15000)});if(!odds.ok)throw Error('Current event retrieval failed.');
    const events=await odds.json();if(!Array.isArray(events))throw Error('Invalid event response.');
    const res=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${league}/teams?limit=1000`,{signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error('Catalog '+res.status);
    const catalog=await res.json();
    const teams=catalog.sports?.flatMap(sport=>sport.leagues?.flatMap(item=>item.teams?.map(entry=>entry.team)||[])||[])||[];
    const names=[...new Set(events.flatMap(event=>[event.away_team,event.home_team]).filter(Boolean))];
    for(const name of names){
      const matches=[normalize(name),normalize(aliases[name]||name)];
      const team=teams.find(team=>[team.displayName,team.shortDisplayName,team.name,team.nickname,team.slug?.replace(/-/g,' ')].filter(Boolean).some(candidate=>matches.includes(normalize(candidate))));
      const logo=team?.logos?.find(logo=>logo.href?.includes('espncdn.com'))?.href;
      if(!team||!logo)continue;
      const filename=`${key}-${team.id}.png`;
      try{await fs.access(path.join('public/team-logos',filename));}catch{
        const image=await fetch(logo,{signal:AbortSignal.timeout(15000)});
        if(!image.ok)continue;
        await fs.writeFile(path.join('public/team-logos',filename),Buffer.from(await image.arrayBuffer()));downloads++;
      }
      identities[`${key}:${normalize(name)}`]={name,shortName:team.name||team.shortDisplayName||name,abbreviation:team.abbreviation||team.shortDisplayName||name,logo:`/team-logos/${filename}`,source:logo};
    }
  }catch{failures.push({key,error:'Current provider events or team catalog could not be retrieved.'});}
}));}
await fs.writeFile('src/lib/team-identities.json',JSON.stringify(identities,null,2)+'\n');
console.log(JSON.stringify({mappedTeams:Object.keys(identities).length,downloaded:downloads,catalogFailures:failures}));
