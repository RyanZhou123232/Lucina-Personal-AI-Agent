(() => {
  const mic=document.getElementById('personalMic'), cancel=document.getElementById('personalVoiceCancel');
  const retry=document.getElementById('personalVoiceRetry'), label=document.getElementById('personalVoiceStatus');
  const draft=document.getElementById('personalDraft'), form=document.getElementById('personalComposer');
  let recorder=null, stream=null, timer=null, controller=null, blob=null, chunks=[], started=0, seconds=0, epoch=0, state='idle';
  const blocked=()=>['permission','recording','stopping','transcribing'].includes(state);
  const update=(next,message)=>{
    state=next; form.dataset.voiceBusy=String(blocked()); label.textContent=message || '';
    mic.textContent=state==='recording'?'■ 停止录音':'录音';
    mic.disabled=['permission','stopping','transcribing'].includes(state);
    cancel.hidden=state==='idle'; retry.hidden=state!=='failed';
    window.dispatchEvent(new CustomEvent('personal-os:voice-state'));
  };
  const release=()=>{if(timer)clearInterval(timer);timer=null;stream?.getTracks().forEach(track=>track.stop());stream=null;};
  const reset=()=>{epoch++;controller?.abort();controller=null;if(recorder?.state==='recording')recorder.stop();recorder=null;release();blob=null;chunks=[];update('idle','');};
  const transcribe=async token=>{
    controller=new AbortController();update('transcribing','正在转写…');
    try {
      const response=await fetch('/api/speech/transcribe',{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type,'X-Audio-Seconds':String(seconds)},body:blob,signal:controller.signal});
      const result=await response.json().catch(()=>({}));
      if(token!==epoch)return;
      if(!response.ok)throw new Error(result.error || '转写失败，请重试。');
      if(typeof result.text!=='string' || !result.text.trim())throw new Error('没有识别到文字，请重新录音。');
      // Read the current draft at completion, preserving edits made while waiting.
      draft.value+=(draft.value && !draft.value.endsWith('\n')?'\n':'')+result.text;
      blob=null;chunks=[];controller=null;update('idle','转写完成，请检查文字后点击 Send。');
      draft.dispatchEvent(new Event('input',{bubbles:true}));draft.focus();
    } catch(error) { if(token===epoch){controller=null;update('failed',error.message || '转写失败，录音已保留。');} }
  };
  mic.addEventListener('click',async()=>{
    if(state==='recording'){update('stopping','正在结束录音…');recorder.stop();return;}
    if(blocked() || draft.disabled || form.dataset.composerBusy === 'true')return;
    const token=++epoch;blob=null;chunks=[];update('permission','正在获取麦克风权限…');
    try {
      if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw new Error('请在 Chrome 或 Edge 的 localhost 或 HTTPS 页面录音。');
      const status=await fetch('/api/speech/transcribe',{credentials:'same-origin'});const config=await status.json();
      if(!status.ok || !config.configured)throw new Error(config.message || config.error || '语音服务尚未配置。');
      const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('当前浏览器不支持录音格式，请使用 Chrome 或 Edge。');
      if(token!==epoch)return;
      const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token!==epoch){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:48000});
      let size=0;
      recorder.ondataavailable=event=>{if(token!==epoch || !event.data.size)return;chunks.push(event.data);size+=event.data.size;if(size>3*1024*1024 && recorder.state==='recording'){update('stopping','录音已达到大小限制。');recorder.stop();}};
      recorder.onerror=()=>{if(token===epoch){reset();label.textContent='录音中断，请重新录制。';}};
      recorder.onstop=()=>{release();if(token!==epoch)return;seconds=Math.min(300,Math.max(0.1,(performance.now()-started)/1000));blob=new Blob(chunks,{type:mime});recorder=null;if(blob.size>3*1024*1024 || !blob.size){update('failed','录音为空或过大，请取消后重新录制。');retry.hidden=true;return;}void transcribe(token);};
      started=performance.now();recorder.start(1000);update('recording','录音中 · 0:00 / 5:00');
      timer=setInterval(()=>{const elapsed=Math.floor((performance.now()-started)/1000);label.textContent=`录音中 · ${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')} / 5:00`;if(elapsed>=300 && recorder?.state==='recording'){update('stopping','已录满 5 分钟，正在转写…');recorder.stop();}},250);
    } catch(error) {if(token===epoch){release();update('idle',error.name==='NotAllowedError'?'麦克风权限被拒绝，请在浏览器中允许后重试。':error.message || '无法开始录音。');}}
  });
  cancel.addEventListener('click',reset);retry.addEventListener('click',()=>{if(blob && !blocked())void transcribe(epoch);});
  // Never auto-send; failed recordings may be retried or discarded independently.
  window.addEventListener('personal-os:signed-out',reset);window.addEventListener('pagehide',reset);
  window.addEventListener('personal-os:conversation-changing',reset);
})();
