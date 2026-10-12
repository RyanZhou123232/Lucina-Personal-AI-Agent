import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {speechConfig,transcribeAudio,validateAudio,audioMime,MAX_AUDIO_BYTES} from '../lib/stt.ts';
const wav=Buffer.alloc(64);wav.write('RIFF');wav.write('WAVE',8);
const envNames=['STT_API_KEY','STT_BASE_URL','STT_MODEL'];
const withConfig=async fn=>{const before=envNames.map(n=>process.env[n]);Object.assign(process.env,{STT_API_KEY:'mock-secret',STT_BASE_URL:'https://test.us-east-1.maas.aliyuncs.com/api/v1',STT_MODEL:'qwen3-asr-flash'});try{await fn();}finally{envNames.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i]});}};
test('native speech config pins the Virginia workspace endpoint and does not accept arbitrary credential destinations',async()=>withConfig(async()=>{
 assert.match(speechConfig().endpoint,/us-east-1.*multimodal-generation\/generation$/);
 for(const base of ['https://attacker.example/api/v1','http://test.us-east-1.maas.aliyuncs.com/api/v1','https://test.us-east-1.maas.aliyuncs.com/compatible-mode/v1','https://user:pass@test.us-east-1.maas.aliyuncs.com/api/v1']){process.env.STT_BASE_URL=base;assert.throws(speechConfig);}
}));
test('audio type, actual size and signature are checked before contacting provider',()=>{
 assert.equal(audioMime('audio/webm;codecs=opus'),'audio/webm');assert.throws(()=>audioMime('text/html'));
 validateAudio(wav,'audio/wav');assert.throws(()=>validateAudio(Buffer.alloc(64),'audio/webm'));
 assert.throws(()=>validateAudio(Buffer.alloc(MAX_AUDIO_BYTES+1),'audio/wav'));
});
test('native request sends only audio and returns editable transcript without creating messages or actions',async()=>withConfig(async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(options.redirect,'error');assert.match(body.input.messages[0].content[0].audio,/^data:audio\/wav;base64,/);assert.equal(body.parameters.asr_options.language,undefined);return Response.json({output:{choices:[{finish_reason:'stop',message:{content:[{text:'我和 Alex 聊了 AI。'}]}}]}});};
 try{assert.equal((await transcribeAudio(wav,'audio/wav')).text,'我和 Alex 聊了 AI。');assert.equal(calls,1);}finally{globalThis.fetch=original;}
}));
test('truncated, empty and provider errors are safe and not silently retried',async()=>withConfig(async()=>{
 const original=globalThis.fetch;
 try{for(const response of [Response.json({output:{choices:[{finish_reason:'length',message:{content:[{text:'partial'}]}}]}}),Response.json({output:{choices:[{finish_reason:'stop',message:{content:[]}}]}}),Response.json({message:'mock-secret private audio'}, {status:403})]){let calls=0;globalThis.fetch=async()=>{calls++;return response};await assert.rejects(transcribeAudio(wav,'audio/wav'),error=>!error.message.includes('mock-secret') && !error.message.includes('private audio'));assert.equal(calls,1);}}finally{globalThis.fetch=original;}
}));
let route=stripTypeScriptTypes(await readFile(new URL('../routes/speech/transcribe/route.ts',import.meta.url),'utf8'));
route=route.replace(/import[^;]+from 'next\/server';/, 'const NextResponse={json:Response.json};');
route=route.replace(/import[^;]+from '@\/lib\/http';/, 'const getAuthenticatedUser=async()=>({user:globalThis.speechUser});const apiError=(error,status=400)=>Response.json({error},{status});');
route=route.replace("'@/lib/stt'",JSON.stringify(new URL('../lib/stt.ts',import.meta.url).href));
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(route).toString('base64'));
const request=(overrides={})=>new Request('http://localhost:3000/api/speech/transcribe',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'audio/wav','x-audio-seconds':'2',...overrides},body:wav});
test('speech endpoint rejects foreign origins, unsigned users and invalid duration without a provider call',async()=>withConfig(async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Unexpected provider call')};
 try{globalThis.speechUser=null;assert.equal((await POST(request())).status,401);globalThis.speechUser={id:'owner'};assert.equal((await POST(request({origin:'https://attacker.example'}))).status,403);assert.equal((await POST(request({'x-audio-seconds':'301'}))).status,400);assert.equal((await POST(request({'content-length':String(MAX_AUDIO_BYTES+1)}))).status,413);}finally{globalThis.fetch=original;delete globalThis.speechUser;}
}));
