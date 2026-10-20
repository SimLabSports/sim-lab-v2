// Explicit league mapping. Similar names or a different competition never authorize reuse of data.
export const bdlSports:Record<string,string>={
 basketball_nba:'nba',basketball_wnba:'wnba',basketball_ncaab:'ncaab',basketball_wncaab:'ncaaw',basketball_ncaaw:'ncaaw',
 americanfootball_nfl:'nfl',americanfootball_ncaaf:'ncaaf',baseball_mlb:'mlb',icehockey_nhl:'nhl',
 soccer_epl:'epl',soccer_spain_la_liga:'laliga',soccer_italy_serie_a:'seriea',soccer_germany_bundesliga:'bundesliga',soccer_france_ligue_one:'ligue1',soccer_usa_mls:'mls',soccer_uefa_champs_league:'ucl',soccer_fifa_world_cup:'fifa',
 basketball_euroleague:'euroleague',basketball_spain_liga_acb:'acb',basketball_france_lnb:'lnb',basketball_germany_bbl:'bbl',basketball_italy_lega_basket:'lba',basketball_turkey_bsl:'bsl',basketball_greece_a1:'gbl',
 mma_mixed_martial_arts:'mma',golf_pga_championship_winner:'pga',golf_masters_tournament_winner:'pga',golf_the_open_championship_winner:'pga',golf_us_open_winner:'pga',
};
export const bdlTeamResearchSports=new Set(['nba','nfl','mlb','nhl','wnba','ncaaf','ncaab','ncaaw']);
export function bdlSport(key:string){return bdlSports[key]??(key.startsWith('tennis_atp_')?'atp':key.startsWith('tennis_wta_')?'wta':null);}
export function bdlCoverage(key:string){
 const sport=bdlSport(key);return {sport,adapter:sport&&bdlTeamResearchSports.has(sport)?'TEAM_RESEARCH':sport?'EVENT_SCHEMA_REQUIRED':'NOT_OFFERED',reason:!sport?'This league has no verified BALLDONTLIE mapping. It needs another statistics source.':bdlTeamResearchSports.has(sport)?'Exact event, completed-game form and permitted statistics; endpoint access is checked on request.':'Provider catalog mapping exists; a verified competition/participant-specific research adapter is still required. Binary team rules are not reused for this sport.'};
}
