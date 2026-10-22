(() => {
  const el = id => document.getElementById(id);
  const workspace = el('personalWorkspace'), drawer = el('personalDrawer'), focus = el('personalFocus');
  const transcript = el('personalTranscript'), shelf = el('personalPendingShelf'), items = el('personalPendingItems');
  const draft = el('personalDraft'), form = el('personalComposer'), menu = el('personalMenuToggle');
  let reviews = [], tasks = [], selected = null, returnFocus = null, noticeTimer;
  const titleFor = change => change.payload_json?.subject || change.payload_json?.title || change.payload_json?.name || change.payload_json?.person_name || ({draft_email:'Email',create_calendar_event:'Calendar',create_observation:'Save observation',create_insight:'Review insight',update_person:'Update person'})[change.change_type] || 'Review memory';
  const closeDrawer = () => { drawer.hidden = true; menu.setAttribute('aria-expanded','false'); };
  const hasEditor = () => !!workspace.querySelector('.personalReviewEditor');
  const protectEdit = () => { const notice=el('personalNotice'); notice.textContent='Save or cancel your edit first.';notice.hidden=false;notice.classList.add('isError'); };
  const closeFocus = (force=false) => { if(!force&&hasEditor()){protectEdit();return;}  focus.hidden = true; workspace.classList.remove('isWorking'); selected = null; renderShelf(); returnFocus?.focus(); };
  const showFocus = (kind,id=null) => {
    if(hasEditor()){protectEdit();return;}
    focus.dataset.single=String(!!id);
    returnFocus = document.activeElement;
    selected = {kind,id}; closeDrawer(); focus.hidden = false; workspace.classList.add('isWorking');
    el('personalReviewPanel').hidden = kind !== 'review'; el('personalTaskSection').hidden = kind !== 'task';
    el('personalFocusTitle').textContent = kind === 'review' ? (id ? titleFor(reviews.find(item=>item.id===id) || {}) : 'Unfinished items') : (id ? tasks.find(item=>item.id===id)?.title || 'Task' : 'Tasks');
    applySelection(); renderShelf(); el('personalFocusClose').focus();
  };
  const applySelection = () => {
    if(selected?.id) el('personalFocusTitle').textContent = selected.kind==='review' ? titleFor(reviews.find(item=>item.id===selected.id) || {}) : tasks.find(item=>item.id===selected.id)?.title || 'Task';
    document.querySelectorAll('#personalReviewList .personalReviewCard').forEach(card => { card.hidden = selected?.kind === 'review' && !!selected.id && card.dataset.itemId !== selected.id; });
    document.querySelectorAll('#personalTaskList .personalTaskCard').forEach(card => { card.hidden = selected?.kind === 'task' && !!selected.id && card.dataset.itemId !== selected.id; });
  };
  const renderShelf = () => {
    items.replaceChildren();
    const pending = [...reviews.map(item=>({kind:'review',id:item.id,title:titleFor(item),attention:!!item.error_message || ['failed','uncertain'].includes(item.google_action?.state)})),...tasks.filter(item=>item.status!=='completed').map(item=>({kind:'task',id:item.id,title:item.title}))];
    shelf.hidden = pending.length === 0;
    pending.forEach(item => {
      const button = document.createElement('button'); button.type='button'; button.className='canvasPendingItem';
      button.classList.toggle('isSelected',selected?.kind===item.kind && selected.id===item.id); button.classList.toggle('isAttention',!!item.attention);
      button.setAttribute('aria-label', 'Open '+item.title); button.setAttribute('aria-pressed',String(selected?.kind===item.kind && selected.id===item.id));
      const dot=document.createElement('span'); dot.className='itemDot'; dot.setAttribute('aria-hidden','true');
      const title=document.createElement('span'); title.textContent=item.title; button.title=item.title;
      button.append(dot,title); button.addEventListener('click',()=>showFocus(item.kind,item.id)); items.append(button);
    });
  };
  menu.addEventListener('click',()=>{drawer.hidden=!drawer.hidden;menu.setAttribute('aria-expanded',String(!drawer.hidden));if(!drawer.hidden)el('personalDrawerClose').focus();});
  el('personalDrawerClose').addEventListener('click',()=>{closeDrawer();menu.focus();});
  el('personalFocusClose').addEventListener('click',()=>closeFocus());
  el('personalTranscriptClose').addEventListener('click',()=>{transcript.hidden=true;draft.focus();});
  el('personalShowTranscript').addEventListener('click',()=>{closeDrawer();closeFocus();transcript.hidden=false;draft.focus();});
  el('personalShowTasks').addEventListener('click',()=>showFocus('task'));
  document.querySelector('[data-personal-tab="context"]').addEventListener('click',()=>{el('personalContextPanel').hidden=false;});
  document.querySelector('[data-personal-tab="review"]').addEventListener('click',()=>showFocus('review'));
  el('personalNewConversation').addEventListener('click',event=>{if(hasEditor()){event.preventDefault();event.stopImmediatePropagation();protectEdit();}},true);
  el('personalNewConversation').addEventListener('click',()=>{closeDrawer();closeFocus();transcript.hidden=true;});
  const resizeDraft = () => {draft.style.height='24px';draft.style.height=Math.min(150,Math.max(24,draft.scrollHeight))+'px';};
  draft.addEventListener('input',resizeDraft);
  resizeDraft();
  new ResizeObserver(()=>{const dock=workspace.querySelector('.personalDock');const height=dock.getBoundingClientRect().height;const bottom=parseFloat(getComputedStyle(dock).bottom)||34;workspace.style.setProperty('--dock-clearance',(height+bottom+28)+'px');}).observe(workspace.querySelector('.personalDock'));
  draft.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!drawer.hidden){closeDrawer();menu.focus();}else if(!focus.hidden)closeFocus();else transcript.hidden=true;}});
  window.addEventListener('personal-os:conversation-visible',()=>{transcript.hidden=false;closeDrawer();});
  window.addEventListener('personal-os:voice-state',()=>{el('personalMic').classList.toggle('isRecording',form.dataset.voiceBusy==='true');});
  window.addEventListener('personal-os:reviews-loaded',event=>{reviews=event.detail; if(selected?.kind==='review' && (selected.id ? !reviews.some(item=>item.id===selected.id) : !reviews.length))closeFocus();renderShelf();});
  window.addEventListener('personal-os:tasks-loaded',event=>{tasks=event.detail; if(selected?.kind==='task'&&selected.id&&!tasks.some(item=>item.id===selected.id&&item.status!=='completed'))closeFocus();renderShelf();});
  window.addEventListener('personal-os:review-cards-ready',applySelection);
  window.addEventListener('personal-os:task-cards-ready',applySelection);
  // Feedback recedes after a successful operation; errors stay until handled.
  new MutationObserver(()=>{clearTimeout(noticeTimer);const notice=el('personalNotice');if(!notice.hidden&&!notice.classList.contains('isError'))noticeTimer=setTimeout(()=>{notice.hidden=true;},4500);}).observe(el('personalNotice'),{childList:true});
  window.addEventListener('personal-os:signed-out',()=>{reviews=[];tasks=[];selected=null;closeDrawer();closeFocus(true);transcript.hidden=true;el('personalContextPanel').hidden=true;clearTimeout(noticeTimer);resizeDraft();});
})();
