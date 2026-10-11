import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal,emailPayload,rawEmail,calendarPayload,localInstant,googleRequest,GoogleError,authorizationUrl,calendarEventId} from '../lib/google-api.ts';
test('Google tokens authenticate the owner and reject tampering',()=>{
 const old=process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 try{const encrypted=seal({access:'test-token'},'owner-a');assert.deepEqual(unseal(encrypted,'owner-a'),{access:'test-token'});assert.throws(()=>unseal(encrypted,'owner-b'));assert.throws(()=>unseal(encrypted.slice(0,-3)+'bad','owner-a'));}
 finally{if(old===undefined)delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=old;}
});
test('email content preserves UTF-8, all recipient lists and reviewed line breaks',()=>{
 const payload=emailPayload({to_email:'alex@example.com',cc:['cc@example.com'],bcc:['bcc@example.com'],subject:'介绍资料',body:'你好 Alex，\n这是你要的资料。'});
 const decoded=Buffer.from(rawEmail(payload,'00000000-0000-0000-0000-000000000100','a'.repeat(64)),'base64url').toString('utf8');
 assert.match(decoded,/To: alex@example.com/);assert.match(decoded,/Cc: cc@example.com/);assert.match(decoded,/Bcc: bcc@example.com/);
 const body=decoded.split('\r\n\r\n')[1];assert.equal(Buffer.from(body,'base64').toString('utf8'),payload.body);
});
test('missing recipients, header injection and missing body are blocked before Google calls',()=>{
 const valid={to_email:'a@example.com',subject:'Hello',body:'Draft'};
 for(const invalid of [{to_email:'Alex'},{to_email:'a@example.com\r\nBcc:bad@example.com'},{subject:'Hello\nBcc:bad@example.com'},{body:''},{cc:['not-email']}])assert.throws(()=>emailPayload({...valid,...invalid}));
});
test('calendar wall times resolve seasonal offsets in the explicit zone',()=>{
 assert.equal(localInstant('2026-10-11T15:00','America/New_York'),'2026-10-11T19:00:00.000Z');
 assert.equal(localInstant('2026-12-11T15:00','America/New_York'),'2026-12-11T20:00:00.000Z');
 assert.equal(localInstant('2026-10-11T15:00','Asia/Kathmandu'),'2026-10-11T09:15:00.000Z');
});
test('DST gaps/ambiguities and impossible calendar dates are rejected',()=>{
 for(const local of ['2026-03-08T02:30','2026-11-01T01:30','2026-02-30T12:00'])assert.throws(()=>localInstant(local,'America/New_York'));
});
test('events require an end and zone, validate invitations, and retain an exact preview',()=>{
 const input={title:'Coffee',start_local:'2026-10-12T15:00',end_local:'2026-10-12T16:00',time_zone:'America/New_York'};
 const draft=calendarPayload(input);assert.equal(draft.send_updates,'none');assert.deepEqual(draft.attendees,[]);assert.equal(draft.calendar_id,'primary');
 for(const invalid of [{end_local:null},{time_zone:'bad-zone'},{end_local:input.start_local},{attendees:['Alex']},{calendar_id:'someone-else'},{send_updates:'maybe'}])assert.throws(()=>calendarPayload({...input,...invalid}));
});
test('calendar event IDs are deterministic and use Google base32hex-compatible characters',()=>{
 const id=calendarEventId('353bd499-fc33-4e3a-84ea-b41f64b4f425');assert.match(id,/^[0-9a-v]{5,1024}$/);assert.equal(id,calendarEventId('353bd499-fc33-4e3a-84ea-b41f64b4f425'));
});
test('Google API network failure on a write is uncertain and never retried automatically',async()=>{
 const before=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network');};
 try{await assert.rejects(googleRequest('mock','https://gmail.googleapis.com/gmail/v1/users/me/drafts/send','POST',{id:'test'}),error=>error instanceof GoogleError && error.uncertain);assert.equal(calls,1);}
 finally{globalThis.fetch=before;}
});
test('definitive API failures do not expose response tokens or credential contents',async()=>{
 const before=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:{message:'secret-token'}},{status:403});
 try{await assert.rejects(googleRequest('mock','https://gmail.googleapis.com/gmail/v1/users/me/drafts','POST',{}),error=>error.message.includes('(403)') && !error.message.includes('secret-token') && !error.uncertain);}
 finally{globalThis.fetch=before;}
});
test('OAuth requests use offline access, state and PKCE on a fixed callback',()=>{
 const keys=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI','GOOGLE_TOKEN_ENCRYPTION_KEY'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{GOOGLE_CLIENT_ID:'mock-client',GOOGLE_CLIENT_SECRET:'mock-secret',GOOGLE_REDIRECT_URI:'http://localhost:3000/api/google/callback',GOOGLE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64')});
 try{const url=new URL(authorizationUrl('state-token','verifier'));assert.equal(url.searchParams.get('state'),'state-token');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');assert.ok(!url.toString().includes('mock-secret'));}
 finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
