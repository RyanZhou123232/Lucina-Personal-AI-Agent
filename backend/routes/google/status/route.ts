import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUser,apiError} from '@/lib/http';
import {connection,googleAdmin,googleConfigured} from '@/lib/google-service';
import {googleConfig} from '@/lib/google-api';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {user}=await getAuthenticatedUser();if(!user)return apiError('Sign in first.',401);
  if(!googleConfigured())return NextResponse.json({configured:false,connected:false},{headers:{'Cache-Control':'no-store'}});
  const saved=await connection(user.id);return NextResponse.json({configured:true,connected:!!saved,email:saved?.email,time_zone:saved?.time_zone},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error instanceof Error?error.message:'Google status unavailable.',503);}
}
export async function DELETE(request:NextRequest){
 try{
  const {user}=await getAuthenticatedUser();if(!user)return apiError('Sign in first.',401);
  if(request.headers.get('origin')!==googleConfig().origin)return apiError('Invalid request origin.',403);
  const db=googleAdmin();const {data,error}=await db.from('google_actions').select('change_id').eq('owner_id',user.id).in('state',['preparing','executing','uncertain']).limit(1);
  if(error || data?.length)return apiError('Resolve in-progress or uncertain Google actions before disconnecting.',409);
  const {error:failure}=await db.from('google_connections').delete().eq('owner_id',user.id);if(failure)throw new Error('Could not disconnect Google.');
  return NextResponse.json({connected:false,message:'Google disconnected from this app. Existing drafts and events remain in Google.'});
 }catch(error){return apiError(error instanceof Error?error.message:'Could not disconnect Google.',400);}
}
