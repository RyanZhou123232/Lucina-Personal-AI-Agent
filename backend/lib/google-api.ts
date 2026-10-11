import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';

export const googleScopes = ['openid','email','https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/calendar.events.owned'];
export class GoogleError extends Error {
  uncertain: boolean;
  constructor(message:string,uncertain=false){super(message);this.uncertain=uncertain;}
}
function secret(){
  const key=Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if(key.length!==32)throw new Error('Configure a 32-byte GOOGLE_TOKEN_ENCRYPTION_KEY before connecting Google.');
  return key;
}
export function seal(value:unknown,owner:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(v=>v.toString('base64url')).join('.');
}
export function unseal<T>(value:string,owner:string):T{
  const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64url'));
  const cipher=createDecipheriv('aes-256-gcm',secret(),iv);cipher.setAAD(Buffer.from(owner));cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8'));
}
export function googleConfig(){
  const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET,redirect=process.env.GOOGLE_REDIRECT_URI;
  if(!clientId || !clientSecret || !redirect)throw new Error('Configure Google OAuth client ID, secret and redirect URI first.');
  const uri=new URL(redirect);
  if(uri.protocol!=='https:' && !(uri.protocol==='http:' && ['localhost','127.0.0.1'].includes(uri.hostname)))throw new Error('Google redirect URI must use HTTPS or localhost.');
  if(uri.pathname!=='/api/google/callback' || uri.search || uri.hash)throw new Error('Google redirect URI must end with /api/google/callback.');
  secret();
  return {clientId,clientSecret,redirect,origin:uri.origin};
}
export function authorizationUrl(state:string,verifier:string){
  const cfg=googleConfig(),url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirect,response_type:'code',scope:googleScopes.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  return url.toString();
}
export async function exchangeToken(values:Record<string,string>){
  const cfg=googleConfig();
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,client_id:cfg.clientId,client_secret:cfg.clientSecret}),signal:AbortSignal.timeout(20_000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok || typeof data?.access_token!=='string')throw new GoogleError('Google authorization expired or was denied. Reconnect your account.');
  return data as {access_token:string;refresh_token?:string;expires_in:number;scope?:string};
}
export async function googleRequest(token:string,path:string,method='GET',body?:unknown){
  if(!path.startsWith('https://gmail.googleapis.com/gmail/v1/') && !path.startsWith('https://www.googleapis.com/calendar/v3/') && path!=='https://openidconnect.googleapis.com/v1/userinfo')throw new Error('Unsupported Google API endpoint.');
  let response:Response;
  try {response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25_000)});}
  catch {throw new GoogleError('Google request was interrupted. Check the provider before retrying.',method!=='GET');}
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new GoogleError(response.status===401?'Google authorization expired. Reconnect your account.':`Google rejected this request (${response.status}).`,method!=='GET' && (response.status>=500 || response.status===408));
  if(!data)throw new GoogleError('Google returned an incomplete result.',method!=='GET');
  return data;
}
export function validZone(value:unknown):string{
  if(typeof value!=='string' || value.length>100)throw new Error('Choose an explicit time zone.');
  try {new Intl.DateTimeFormat('en-US',{timeZone:value});}catch {throw new Error('Invalid time zone.');}
  return value;
}
function address(value:unknown):string{
  if(typeof value!=='string' || value.length>254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(value))throw new Error('Supply the recipient’s actual email address.');
  return value;
}
function text(value:unknown,name:string,max=20_000):string{
  if(typeof value!=='string' || !value.trim() || value.length>max)throw new Error(`Provide ${name}.`);
  return value;
}
function addresses(value:unknown):string[]{
  if(value==null)return [];
  if(!Array.isArray(value) || value.length>20)throw new Error('Recipients must be a list of email addresses (maximum 20).');
  return [...new Set(value.map(address))];
}
export type EmailDraft = {to_email:string;cc:string[];bcc:string[];subject:string;body:string};
export function emailPayload(payload:Record<string,unknown>):EmailDraft{
  const subject=text(payload.subject,'a subject',998);
  if(/[\r\n]/.test(subject))throw new Error('The subject must be a single line.');
  return {to_email:address(payload.to_email),cc:addresses(payload.cc),bcc:addresses(payload.bcc),subject,body:text(payload.body,'an email body')};
}
export function rawEmail(payload:EmailDraft,changeId:string,hash:string){
  const headers=['To: '+payload.to_email,...(payload.cc.length?['Cc: '+payload.cc.join(', ')]:[]),...(payload.bcc.length?['Bcc: '+payload.bcc.join(', ')]:[]),'Subject: =?UTF-8?B?'+Buffer.from(payload.subject).toString('base64')+'?=','Message-ID: <'+changeId+'.'+hash.slice(0,24)+'@personal-os.invalid>','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64'];
  const body=Buffer.from(payload.body).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
  return Buffer.from(headers.join('\r\n')+'\r\n\r\n'+body).toString('base64url');
}
// Resolve wall-clock times without asking the model to invent UTC offsets.
// Reject nonexistent or ambiguous DST times rather than picking silently.
export function localInstant(value:unknown,zone:string):string{
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Use local date and time YYYY-MM-DDTHH:mm.');
  const parts=value.match(/\d+/g)!.map(Number),nominal=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4]);
  if(new Date(nominal).toISOString().slice(0,16)!==value)throw new Error('Invalid calendar date or time.');
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wall=(stamp:number)=>{const p=Object.fromEntries(format.formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
  const candidates:number[]=[];
  // All contemporary zone offsets are multiples of 15 minutes, within ±14 hours.
  for(let delta=-14*60;delta<=14*60;delta+=15){const stamp=nominal+delta*60_000;if(wall(stamp)===value)candidates.push(stamp);}
  if(candidates.length!==1)throw new Error(candidates.length?'That time occurs twice due to daylight saving. Choose an unambiguous time.':'That local time does not exist in this time zone.');
  return new Date(candidates[0]).toISOString();
}
export type CalendarDraft={title:string;description:string;location:string;start_local:string;end_local:string;time_zone:string;start_at:string;end_at:string;attendees:string[];send_updates:'none'|'all';calendar_id:'primary'};
export function calendarPayload(payload:Record<string,unknown>):CalendarDraft{
  const zone=validZone(payload.time_zone),start=localInstant(payload.start_local,zone),end=localInstant(payload.end_local,zone);
  if(end<=start)throw new Error('The event must end after it starts.');
  if(payload.calendar_id!=null && payload.calendar_id!=='primary')throw new Error('This version creates events in your primary calendar.');
  if(payload.send_updates!=null && !['none','all'].includes(String(payload.send_updates)))throw new Error('Choose whether to invite attendees.');
  return {title:text(payload.title,'an event title',1000),description:typeof payload.description==='string'?payload.description.slice(0,20_000):'',location:typeof payload.location==='string'?payload.location.slice(0,1000):'',start_local:payload.start_local as string,end_local:payload.end_local as string,time_zone:zone,start_at:start,end_at:end,attendees:addresses(payload.attendees),send_updates:payload.send_updates==='all'?'all':'none',calendar_id:'primary'};
}
export function actionHash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function calendarEventId(changeId:string){return 'pos'+changeId.replaceAll('-','').toLowerCase();}
