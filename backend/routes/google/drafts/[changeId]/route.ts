import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUser,apiError} from '@/lib/http';
import {prepareGmailDraft} from '@/lib/google-service';
import {googleConfig} from '@/lib/google-api';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{changeId:string}>}){
 try{
  const {user}=await getAuthenticatedUser();if(!user)return apiError('Sign in first.',401);
  if(request.headers.get('origin')!==googleConfig().origin)return apiError('Invalid request origin.',403);
  const {changeId}=await params;const result=await prepareGmailDraft(user.id,changeId);
  return NextResponse.json({...result,message:'Saved in Gmail drafts. Nothing has been sent.'});
 }catch(error){return apiError(error instanceof Error?error.message:'Could not prepare Gmail draft.',422);}
}
