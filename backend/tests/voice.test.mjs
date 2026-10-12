import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../../frontend/public/legacy/src/js/voice.js',import.meta.url),'utf8');
function setup({pending=false,denied=false}={}){
 const elements=new Map();const windowEvents=new Map();const calls=[];let stopped=0,now=0,tick,resolvePost;
 for(const id of ['personalMic','personalVoiceCancel','personalVoiceRetry','personalVoiceStatus','personalDraft','personalComposer'])elements.set(id,{dataset:{},value:'',disabled:false,hidden:false,events:new Map(),addEventListener(name,fn){this.events.set(name,fn)},dispatchEvent(event){return this.events.get(event.type)?.(event)},focus(){}});
 class Recorder{static instance;static isTypeSupported(){return true}constructor(){Recorder.instance=this;this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,...Array(32).fill(0)])])});this.onstop?.();}}
 const context={document:{getElementById:id=>elements.get(id)},window:{isSecureContext:true,MediaRecorder:Recorder,addEventListener:(name,fn)=>windowEvents.set(name,fn),dispatchEvent:()=>{}},MediaRecorder:Recorder,Blob,AbortController,CustomEvent,Event,performance:{now:()=>now},setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{tick=null},navigator:{mediaDevices:{getUserMedia:async()=>{if(denied)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});return{getTracks:()=>[{stop(){stopped++}}]}}}},fetch:async(path,options={})=>{calls.push({path,...options});if(!options.method)return Response.json({configured:true});if(pending)return new Promise(resolve=>{resolvePost=resolve});return Response.json({text:'我和 Alex 聊了。'});}};
 vm.runInNewContext(code,context);
 return{elements,calls,Recorder,click:id=>elements.get(id).events.get('click')(),advance:value=>{now=value;tick?.()},emit:name=>windowEvents.get(name)?.(),get stopped(){return stopped},complete:()=>resolvePost(Response.json({text:'stale transcript'}))};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('recording appends to the latest typed draft and never submits or creates messages',async()=>{
 const ui=setup();ui.elements.get('personalDraft').value='Existing draft';await ui.click('personalMic');assert.equal(ui.elements.get('personalComposer').dataset.voiceBusy,'true');
 ui.elements.get('personalDraft').value='Edited while recording';await ui.click('personalMic');await flush();
 assert.equal(ui.elements.get('personalDraft').value,'Edited while recording\n我和 Alex 聊了。');assert.equal(ui.stopped,1);
 assert.equal(ui.calls.filter(c=>c.method==='POST').length,1);assert.ok(ui.calls.every(c=>c.path==='/api/speech/transcribe'));assert.equal(ui.elements.get('personalComposer').dataset.voiceBusy,'false');
});
test('cancelled transcription cannot append late text and releases microphone',async()=>{
 const ui=setup({pending:true});await ui.click('personalMic');await ui.click('personalMic');await flush();await ui.click('personalVoiceCancel');ui.complete();await flush();
 assert.equal(ui.elements.get('personalDraft').value,'');assert.equal(ui.elements.get('personalComposer').dataset.voiceBusy,'false');assert.equal(ui.stopped,1);
});
test('microphone denial leaves typing usable without a transcription request',async()=>{
 const ui=setup({denied:true});await ui.click('personalMic');assert.equal(ui.elements.get('personalComposer').dataset.voiceBusy,'false');assert.match(ui.elements.get('personalVoiceStatus').textContent,/权限被拒绝/);assert.ok(!ui.calls.some(c=>c.method==='POST'));
});
test('five-minute cap stops recording and signout discards its pending transcript',async()=>{
 const ui=setup({pending:true});await ui.click('personalMic');ui.advance(300000);await flush();assert.equal(ui.Recorder.instance.state,'inactive');assert.equal(ui.calls.at(-1).headers['X-Audio-Seconds'],'300');ui.emit('personal-os:signed-out');ui.complete();await flush();assert.equal(ui.elements.get('personalDraft').value,'');assert.equal(ui.stopped,1);
});
