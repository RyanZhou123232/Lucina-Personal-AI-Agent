import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
let code=stripTypeScriptTypes(await readFile(new URL('../routes/pending-changes/[changeId]/route.ts',import.meta.url),'utf8'));
code=code.replace(/import[^;]+from '@\/lib\/google-service';/,'const executeGoogleAction=(...args)=>globalThis.googleRouteFixture.execute(...args);');
code=code.replace(/import[^;]+from '@\/lib\/google-api';/,'const googleConfig=()=>({origin:"http://localhost:3000"}); const emailPayload=p=>p;const calendarPayload=p=>p;');
code=code.replace(/import[^;]+from "next\/server";/,'const NextResponse={json:value=>Response.json(value)};');
code=code.replace(/import[^;]+from "@\/lib\/http";/,'const getAuthenticatedUser=async()=>globalThis.googleRouteFixture;const apiError=(error,status=400)=>Response.json({error},{status});');
code=code.replace(/import[^;]+from "@\/lib\/review";/,'const prepareReviewEdit=(original,payload)=>payload;');
const {PATCH}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function setup({signedIn=true,status='pending'}={}){
 const row={id:'change',status,change_type:'draft_email',payload_json:{to_email:'self@example.com',subject:'Hello',body:'Reviewed'}};
 const calls=[];const fixture={user:signedIn?{id:'owner'}:null,supabase:{from(){const q={select(){return q},eq(){return q},async maybeSingle(){return{data:row,error:null}}};return q}},execute:async(...args)=>{calls.push(args);return{status:'committed'}}};
 globalThis.googleRouteFixture=fixture;return{row,calls};
}
function approve(payload,origin='http://localhost:3000'){
 return PATCH(new Request('http://localhost:3000/api/pending-changes/change',{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify({status:'approved',expected_payload:payload})}),{params:Promise.resolve({changeId:'change'})});
}
test('external approval requires sign-in, trusted origin and the exact reviewed snapshot',async()=>{
 let f=setup({signedIn:false});assert.equal((await approve(f.row.payload_json)).status,401);assert.equal(f.calls.length,0);
 f=setup();assert.equal((await approve(f.row.payload_json,'https://foreign.example')).status,403);assert.equal(f.calls.length,0);
 assert.equal((await approve()).status,409);assert.equal((await approve({...f.row.payload_json,body:'Stale'})).status,409);assert.equal(f.calls.length,0);
});
test('explicit approval passes owned proposal and snapshot to the Google executor',async()=>{
 const f=setup();assert.equal((await approve(f.row.payload_json)).status,200);assert.deepEqual(f.calls,[['owner','change',f.row.payload_json]]);
});
test('a rejected external proposal cannot be sent',async()=>{
 const f=setup({status:'rejected'});assert.equal((await approve(f.row.payload_json)).status,409);assert.equal(f.calls.length,0);
});
