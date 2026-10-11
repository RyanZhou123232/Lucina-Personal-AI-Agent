import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {getAuthenticatedUser} from '@/lib/http';
import {googleConfig,unseal} from '@/lib/google-api';
import {saveConnection} from '@/lib/google-service';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 const cfg=googleConfig(),target=new URL('/',cfg.origin);
 try{
  const {user}=await getAuthenticatedUser();if(!user)throw new Error('Sign in again before connecting Google.');
  const cookie=request.cookies.get('personal_os_google_state')?.value;if(!cookie)throw new Error('Google connection expired. Start again.');
  const state=unseal<{owner:string;nonce:string;verifier:string;zone:string;issued:number}>(cookie,user.id);
  const supplied=request.nextUrl.searchParams.get('state') || '';
  if(state.owner!==user.id || Date.now()-state.issued>600_000 || state.issued>Date.now() || supplied.length!==state.nonce.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(state.nonce)))throw new Error('Google connection could not be verified. Start again.');
  const code=request.nextUrl.searchParams.get('code');if(!code || request.nextUrl.searchParams.has('error'))throw new Error('Google authorization was cancelled.');
  await saveConnection(user.id,code,state.verifier,state.zone);target.searchParams.set('google','connected');
 }catch(error){target.searchParams.set('google','error');target.searchParams.set('reason',error instanceof Error?error.message:'Could not connect Google.');}
 const response=NextResponse.redirect(target);response.cookies.set('personal_os_google_state','',{httpOnly:true,sameSite:'lax',secure:cfg.origin.startsWith('https:'),path:'/api/google',maxAge:0});response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}
