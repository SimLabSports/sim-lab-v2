import {GET as intelligence} from '../intelligence/route';
import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
export async function GET(request:NextRequest){const response=await intelligence(request);const data=await response.json();return NextResponse.json(response.ok?data.experts:data,{status:response.status,headers:{'Cache-Control':'no-store'}});}
