import {NextRequest,NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {getAuthenticatedUser,apiError} from '@/lib/http';
import {authorizationUrl,googleConfig,seal,validZone} from '@/lib/google-api';
import {googleConfigured} from '@/lib/google-service';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const {user}=await getAuthenticatedUser();if(!user)return apiError('Sign in before connecting Google.',401);
  if(!googleConfigured())return apiError('Complete the server Google configuration before connecting.',503);
  const cfg=googleConfig();if(request.headers.get('origin')!==cfg.origin)return apiError('Open the app at the configured Google redirect origin.',403);
  const body=await request.json().catch(()=>null),zone=validZone(body?.time_zone);
  const nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const response=NextResponse.json({url:authorizationUrl(nonce,verifier)});
  response.cookies.set('personal_os_google_state',seal({owner:user.id,nonce,verifier,zone,issued:Date.now()},user.id),{httpOnly:true,sameSite:'lax',secure:cfg.origin.startsWith('https:'),path:'/api/google',maxAge:600});
  response.headers.set('Cache-Control','no-store');return response;
 }catch(error){return apiError(error instanceof Error?error.message:'Could not connect Google.',400);}
}
