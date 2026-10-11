import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {googleConfig,googleScopes,exchangeToken,googleRequest,seal,unseal,GoogleError,emailPayload,calendarPayload,rawEmail,actionHash,calendarEventId} from '@/lib/google-api';

export function googleAdmin():SupabaseClient{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!url || !key)throw new Error('Configure server-only SUPABASE_SECRET_KEY for Google integrations.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function googleConfigured(){try{googleConfig();return !!process.env.SUPABASE_SECRET_KEY;}catch{return false;}}
type Connection={owner_id:string;google_subject:string;email:string;scopes:string[];access_cipher:string;refresh_cipher:string;expires_at:string;time_zone:string};
export async function connection(owner:string,db=googleAdmin()):Promise<Connection|null>{
  const {data,error}=await db.from('google_connections').select('*').eq('owner_id',owner).maybeSingle();
  if(error)throw new Error('Google integration storage is unavailable. Apply migration 011.');
  return data;
}
export async function saveConnection(owner:string,code:string,verifier:string,zone:string){
  const cfg=googleConfig(),tokens=await exchangeToken({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:cfg.redirect});
  const profile=await googleRequest(tokens.access_token,'https://openidconnect.googleapis.com/v1/userinfo');
  if(typeof profile.sub!=='string' || typeof profile.email!=='string' || profile.email_verified!==true)throw new Error('Google did not return a verified account.');
  const scopes=(tokens.scope || '').split(' ');
  if(googleScopes.slice(2).some(scope=>!scopes.includes(scope)))throw new Error('Grant Gmail draft/send and owned calendar event permissions to continue.');
  const db=googleAdmin(),previous=await connection(owner,db);
  if(previous && previous.google_subject!==profile.sub){
    const {data,error}=await db.from('google_actions').select('change_id,pending_changes!inner(status)').eq('owner_id',owner).in('state',['preparing','prepared','executing','uncertain']).neq('pending_changes.status','rejected').limit(1);
    if(error || data?.length)throw new Error('Finish or reject existing Google proposals before switching accounts.');
  }
  const refresh=tokens.refresh_token || (previous && previous.google_subject===profile.sub ? unseal<string>(previous.refresh_cipher,owner):null);
  if(!refresh)throw new Error('Google did not issue offline access. Reconnect and grant consent.');
  const {error}=await db.from('google_connections').upsert({owner_id:owner,google_subject:profile.sub,email:profile.email,scopes,time_zone:zone,access_cipher:seal(tokens.access_token,owner),refresh_cipher:seal(refresh,owner),expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),updated_at:new Date().toISOString()});
  if(error)throw new Error('Could not save the Google connection.');
}
async function access(owner:string,db:SupabaseClient){
  const saved=await connection(owner,db);
  if(!saved)throw new Error('Connect Google in the workspace first.');
  if(googleScopes.slice(2).some(scope=>!saved.scopes.includes(scope)))throw new Error('Reconnect Google and grant the requested permissions.');
  if(Date.parse(saved.expires_at)>Date.now()+60_000)return unseal<string>(saved.access_cipher,owner);
  const result=await exchangeToken({grant_type:'refresh_token',refresh_token:unseal<string>(saved.refresh_cipher,owner)});
  const {error}=await db.from('google_connections').update({access_cipher:seal(result.access_token,owner),...(result.refresh_token?{refresh_cipher:seal(result.refresh_token,owner)}:{}),expires_at:new Date(Date.now()+result.expires_in*1000).toISOString(),updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('google_subject',saved.google_subject);
  if(error)throw new Error('Could not refresh the stored Google connection.');
  return result.access_token;
}
async function proposal(owner:string,id:string,db:SupabaseClient){
  const {data,error}=await db.from('pending_changes').select('id,status,change_type,payload_json').eq('id',id).eq('owner_id',owner).maybeSingle();
  if(error)throw new Error(error.code==='42501'?'Google integration database permissions are missing. Apply migration 012.':'Could not read the external proposal. Check Google integration database setup.');
  if(!data)throw new Error('External proposal not found.');
  return data;
}
async function claim(owner:string,id:string,phase:string,hash:string,snapshot:unknown,db:SupabaseClient){
  const {data,error}=await db.rpc('google_action_claim',{p_owner:owner,p_change:id,p_phase:phase,p_hash:hash,p_snapshot:snapshot});
  if(error)throw new Error(error.message);
  return data;
}
async function finish(owner:string,id:string,action:Record<string,string>,state:string,draft:string|null,remote:string|null,result:unknown,error:string|null,db:SupabaseClient){
  const {data,error:failure}=await db.rpc('google_action_finish',{p_owner:owner,p_change:id,p_claim:action.claim_token,p_state:state,p_draft:draft,p_remote:remote,p_result:result,p_error:error});
  if(failure)throw new GoogleError('Google responded, but its receipt could not be saved. Check Gmail or Calendar; do not repeat this action.',true);
  return data;
}
export async function prepareGmailDraft(owner:string,id:string,db=googleAdmin()){
  const change=await proposal(owner,id,db);
  if(change.change_type!=='draft_email')throw new Error('This proposal is not an email draft.');
  const payload=emailPayload(change.payload_json),hash=actionHash(payload);
  const action=await claim(owner,id,'prepare',hash,change.payload_json,db);
  if(action.cached)return {draftId:action.draft_id,prepared:true};
  try{
    const token=await access(owner,db);
    const raw=rawEmail(payload,id,hash);
    const result=await googleRequest(token,'https://gmail.googleapis.com/gmail/v1/users/me/drafts'+(action.draft_id?'/'+encodeURIComponent(action.draft_id):''),action.draft_id?'PUT':'POST',{message:{raw}});
    if(typeof result.id!=='string' || !result.id)throw new GoogleError('Google did not return a draft receipt.',true);
    await finish(owner,id,action,'prepared',result.id,null,payload,null,db);
    return {draftId:result.id,prepared:true};
  }catch(error){
    const uncertain=error instanceof GoogleError && error.uncertain;
    await finish(owner,id,action,uncertain?'uncertain':'failed',action.draft_id||null,null,payload,error instanceof Error?error.message:'Could not prepare Gmail draft.',db).catch(()=>{});
    throw error;
  }
}
export async function executeGoogleAction(owner:string,id:string,expectedPayload:unknown,db=googleAdmin()){
  const change=await proposal(owner,id,db);
  if(JSON.stringify(change.payload_json)!==JSON.stringify(expectedPayload))throw new Error('This proposal changed. Reload Review before approving.');
  if(!['draft_email','create_calendar_event'].includes(change.change_type))throw new Error('Unsupported Google proposal.');
  // Completed actions are returned without an external call or token refresh.
  const {data:receipt,error:loadError}=await db.from('google_actions').select('*').eq('change_id',id).eq('owner_id',owner).maybeSingle();
  if(loadError)throw new Error('Could not read the Google action receipt.');
  if(receipt?.state==='succeeded')return {alreadyCommitted:true,remoteId:receipt.remote_id,message:'Already completed; no duplicate action was performed.'};
  if(receipt && ['preparing','executing','uncertain'].includes(receipt.state))throw new Error('The previous action may already have completed. Check Gmail Sent or Google Calendar; automatic retry is blocked.');
  const email=change.change_type==='draft_email',payload=email?emailPayload(change.payload_json):calendarPayload(change.payload_json);
  if(email)await prepareGmailDraft(owner,id,db);
  const hash=actionHash(payload),action=await claim(owner,id,'execute',hash,change.payload_json,db);
  if(action.cached)return {alreadyCommitted:true,remoteId:action.remote_id,message:'Already completed; no duplicate action was performed.'};
  try{
    const token=await access(owner,db);
    let result;
    if(email){
      // Send the exact reviewed contents, including edits made in this app.
      // Refresh the provider draft before sending; Gmail-side edits are replaced.
      await googleRequest(token,'https://gmail.googleapis.com/gmail/v1/users/me/drafts/'+encodeURIComponent(action.draft_id),'PUT',{message:{raw:rawEmail(payload as ReturnType<typeof emailPayload>,id,hash)}});
      result=await googleRequest(token,'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send','POST',{id:action.draft_id});
    }else{
      const event=payload as ReturnType<typeof calendarPayload>,eventId=calendarEventId(id);
      const body={id:eventId,summary:event.title,description:event.description,location:event.location,start:{dateTime:event.start_at,timeZone:event.time_zone},end:{dateTime:event.end_at,timeZone:event.time_zone},attendees:event.attendees.map(email=>({email})),extendedProperties:{private:{personal_os_change:id,personal_os_hash:hash}}};
      try{result=await googleRequest(token,'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates='+event.send_updates,'POST',body);}
      catch(error){
        if(error instanceof Error && error.message.includes('(409)')){
          result=await googleRequest(token,'https://www.googleapis.com/calendar/v3/calendars/primary/events/'+eventId);
          if(result.extendedProperties?.private?.personal_os_hash!==hash)throw new GoogleError('A different event already uses this identifier.',true);
        }else throw error;
      }
    }
    if(typeof result.id!=='string' || !result.id)throw new GoogleError('Google returned no completion receipt.',true);
    await finish(owner,id,action,'succeeded',action.draft_id||null,result.id,payload,null,db);
    return {status:'committed',remoteId:result.id,message:email?'Approved email sent through Gmail.':'Approved event created in Google Calendar.'};
  }catch(error){
    const uncertain=error instanceof GoogleError && error.uncertain;
    await finish(owner,id,action,uncertain?'uncertain':'failed',action.draft_id||null,null,payload,error instanceof Error?error.message:'Google action failed.',db).catch(()=>{});
    throw error;
  }
}
