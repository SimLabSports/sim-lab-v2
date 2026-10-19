import 'server-only';
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
export const adminCookie='simlab_admin';
export function adminConfigured(){return (process.env.SIMLAB_ADMIN_TOKEN?.length??0)>=32;}
export function tokenMatches(input:string){if(!adminConfigured())return false;return timingSafeEqual(createHash('sha256').update(input).digest(),createHash('sha256').update(process.env.SIMLAB_ADMIN_TOKEN!).digest());}
export function createSession(){const payload=`${Date.now()}.${randomBytes(24).toString('hex')}`;return `${payload}.${createHmac('sha256',process.env.SIMLAB_ADMIN_TOKEN!).update(payload).digest('hex')}`;}
export function sessionValid(value?:string){
 if(!adminConfigured()||!value)return false;
 const parts=value.split('.');if(parts.length!==3||!/^\d+$/.test(parts[0])||!/^[a-f0-9]{64}$/.test(parts[2]))return false;
 const age=Date.now()-Number(parts[0]);if(age<0||age>8*3600000)return false;
 const signature=createHmac('sha256',process.env.SIMLAB_ADMIN_TOKEN!).update(parts.slice(0,2).join('.')).digest('hex');
 return timingSafeEqual(Buffer.from(parts[2],'hex'),Buffer.from(signature,'hex'));
}
export function authorized(request:NextRequest){return sessionValid(request.cookies.get(adminCookie)?.value);}
export function sameOrigin(request:NextRequest){return request.headers.get('origin')===new URL(request.url).origin;}
const attempts=new Map<string,{count:number;until:number}>();
export function allowLogin(request:NextRequest){
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';const now=Date.now();
 for(const [key,value]of attempts)if(value.until<now)attempts.delete(key);
 const old=attempts.get(ip);if(old&&old.count>=5)return false;
 attempts.set(ip,{count:(old?.count??0)+1,until:old?.until??now+60000});return true;
}
