import identities from './team-identities.json';
type Identity={name:string;shortName?:string;abbreviation:string;logo:string;source:string};
const registry=identities as Record<string,Identity>;
export function normalizeTeam(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
export function teamIdentity(name:string,sport:string){return registry[`${sport}:${normalizeTeam(name)}`]??null;}
export function teamAbbreviation(name:string,sport:string){return teamIdentity(name,sport)?.abbreviation??name;}
export function teamDisplayName(name:string,sport:string){return teamIdentity(name,sport)?.shortName??name;}
