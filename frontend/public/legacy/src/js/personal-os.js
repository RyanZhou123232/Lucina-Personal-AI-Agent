(() => {
  const workspace = document.getElementById("personalWorkspace");
  const messagesElement = document.getElementById("personalMessages");
  const form = document.getElementById("personalComposer");
  const draft = document.getElementById("personalDraft");
  const sendButton = document.getElementById("personalSend");
  const newConversationButton = document.getElementById("personalNewConversation");
  const notice = document.getElementById("personalNotice");
  const status = document.getElementById("personalSaveStatus");
  const reviewList = document.getElementById("personalReviewList");
  const reviewCount = document.getElementById("personalReviewCount");
  const contextPanel = document.getElementById("personalContextPanel");
  const reviewPanel = document.getElementById("personalReviewPanel");
  const googleButton=document.getElementById("personalGoogleConnect"),googleDisconnect=document.getElementById("personalGoogleDisconnect"),googleStatus=document.getElementById("personalGoogleStatus");
  const refreshGoogle=async()=>{
    try{const result=await NetworkAPI.googleStatus();googleStatus.textContent=result.connected?"Google · "+result.email:"Google not connected";googleButton.textContent=result.connected?"Reconnect Google":"Connect Google";googleButton.disabled=!result.configured;googleButton.title=result.configured?"":"Configure Google OAuth and apply migration 011 first.";googleDisconnect.hidden=!result.connected;}
    catch(error){googleStatus.textContent="Google unavailable";showNotice(error.message,true);}
  };
  googleButton.addEventListener("click",async()=>{googleButton.disabled=true;try{const result=await NetworkAPI.connectGoogle();window.top.location.href=result.url;}catch(error){showNotice(error.message,true);googleButton.disabled=false;}});
  googleDisconnect.addEventListener("click",async()=>{googleDisconnect.disabled=true;try{const result=await NetworkAPI.disconnectGoogle();showNotice(result.message);await refreshGoogle();}catch(error){showNotice(error.message,true);}finally{googleDisconnect.disabled=false;}});
  let conversationId = null;
  let saving = false;
  let switchingConversation = false;
  let conversationEpoch = 0;
  let editingReviewId = null;

  const showNotice = (message, isError = false) => {
    notice.textContent = message;
    notice.hidden = !message;
    notice.classList.toggle("isError", isError);
  };

  const addMessage = (message, role = "user") => {
    const article = document.createElement("article");
    article.className = `personalMessage ${role === "assistant" ? "assistantMessage" : "userMessage"}`;
    if (role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "personalAvatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "◖";
      article.append(avatar);
    }
    const body = document.createElement("div");
    body.className = "personalMessageBody";
    const meta = document.createElement("span");
    meta.className = "personalMessageMeta";
    meta.textContent = role === "assistant" ? "AGENT · NOW" : "YOU · SAVED";
    const text = document.createElement("p");
    text.textContent = message.content;
    body.append(meta, text);
    const memory = message.metadata?.memory;
    const cited = memory?.evidence?.filter(item => memory.citations?.includes(item.citationId)) || [];
    if (role === "assistant" && cited.length) {
      // Evidence records may share an original message. Count/display that message
      // once, retaining all citation labels so readers can trace the answer.
      const grouped = new Map();
      cited.forEach(item => {
        const originals = item.sources || [];
        if (!originals.length) {
          grouped.set(`record:${item.citationId}`, { item, labels: [item.citationId], source: null });
        }
        originals.forEach((source, index) => {
          const key = source.id ? `message:${source.id}` : `unknown:${item.citationId}:${index}`;
          const group = grouped.get(key);
          if (group) {
            if (!group.labels.includes(item.citationId)) group.labels.push(item.citationId);
          } else grouped.set(key, { item, labels: [item.citationId], source });
        });
      });
      const sources = document.createElement("details");
      sources.className = "personalMemorySources";
      const summary = document.createElement("summary");
      const stateRecords = cited.filter(item => item.entityType === "tasks" && memory.verification?.citationSupport?.some(support => support.kind === "record" && support.citationId === item.citationId && support.entityId === item.entityId));
      summary.textContent = "Sources · " + (grouped.size + stateRecords.length);
      sources.append(summary);
      grouped.forEach(({ item, labels, source }) => {
        const heading = document.createElement("p");
        heading.textContent = labels.map(id => `[${id}]`).join(" ") + " " + (source?.content || item.record.title || item.record.name || item.record.content || item.record.question || "Saved record");
        sources.append(heading);
        if (source) {
          if (source.context?.length) {
            const context = document.createElement("details");
            const caption = document.createElement("summary");
            caption.textContent = "Earlier user context";
            context.append(caption);
            source.context.forEach(message => {
              const original = document.createElement("blockquote");
              original.textContent = message.content;
              context.append(original);
            });
            sources.append(context);
          }
          const quote = document.createElement("blockquote");
          quote.textContent = source.content;
          const date = document.createElement("small");
          date.textContent = new Date(source.created_at).toLocaleString();
          quote.append(document.createElement("br"), date);
          sources.append(quote);
        } else {
          const note = document.createElement("small");
          note.textContent = "Source: current saved record";
          sources.append(note);
        }
      });
      stateRecords.forEach(item => {
        const heading = document.createElement("p");
        heading.textContent = `[${item.citationId}] ` + (item.record.title || "Saved task");
        const state = document.createElement("blockquote");
        state.textContent = "Current task status: " + (item.record.status === "completed" ? "Completed" : item.record.status === "pending" ? "Pending" : item.record.status || "Unknown");
        if (item.record.completed_at) {
          const date = document.createElement("small");
          date.textContent = new Date(item.record.completed_at).toLocaleString();
          state.append(document.createElement("br"), date);
        }
        sources.append(heading, state);
      });
      body.append(sources);
    }
    article.append(body);
    messagesElement.append(article);
  };

  const setLoading = (value) => {
    saving = value;
    sendButton.disabled = value || switchingConversation || !draft.value.trim();
    newConversationButton.disabled = value || switchingConversation;
    sendButton.textContent = value ? "Saving…" : "Send ↗";
  };

  const makeReviewEditor = (change, onSaved, onCancel) => {
    const editor = document.createElement("form");
    editor.className = "personalReviewEditor";
    const hint = document.createElement("p");
    hint.className = "personalEditHint";
    hint.textContent = "Save your corrections, then approve separately. Source evidence stays attached.";
    const error = document.createElement("p");
    error.className = "personalReviewError";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const fields = [];
    const dateFields = new Set(["date", "occurred_at", "due_at", "started_at", "ended_at", "decided_at", "first_formed_at", "last_reinforced_at"]);
    const labels = { name: "Name", title: "Title", notes: "Notes", description: "Description", summary: "Summary", content: "Content", person_name: "Person", interaction_type: "Interaction type", occurred_at: "Occurred at", due_at: "Due at", email: "Email", company: "Company", role: "Role", location: "Location", priority: "Priority", attributes: "Additional attributes", subject: "Subject", body: "Email body", to_email: "Recipient", start_local: "Start (YYYY-MM-DDTHH:mm)", end_local: "End (YYYY-MM-DDTHH:mm)", time_zone: "Time zone (e.g. America/New_York)", send_updates: "Send invitation notifications (all or none)", cc: "Cc", bcc: "Bcc", attendees: "Guest emails", question: "Question" };
    const original = change.payload_json;
    const requiredKey = { create_person: "name", create_task: "title", create_event: "title", create_observation: "content", create_insight: "content", create_belief: "content", create_decision: "question" }[change.change_type];
    const values = { ...original };
    // Preserve the alternative field names already supported by the commit function.
    const alternatives = { content: ["observation", "insight", "belief"], question: ["title"] };
    const requiredField = requiredKey && (Object.hasOwn(values, requiredKey) ? requiredKey : alternatives[requiredKey]?.find(key => Object.hasOwn(values, key)) || requiredKey);
    if (requiredField && !Object.hasOwn(values, requiredField)) values[requiredField] = "";
    editor.append(hint);
    Object.entries(values).filter(([key]) => !["provenance", "start_at", "end_at", "calendar_id"].includes(key)).forEach(([key, value]) => {
      const label = document.createElement("label");
      const caption = document.createElement("span");
      const complex = value !== null && typeof value === "object";
      const emailList = ["cc", "bcc", "attendees"].includes(key) && Array.isArray(value);
      caption.textContent = (labels[key] || key.replaceAll("_", " ")) + (emailList ? " (separate with commas)" : complex ? " (JSON)" : "");
      const input = document.createElement(typeof value === "boolean" ? "input" : "textarea");
      input.name = key;
      if (typeof value === "boolean") {
        input.type = "checkbox";
        input.checked = value;
      } else {
        input.rows = complex || ["notes", "description", "summary", "content", "body"].includes(key) ? 3 : 2;
        input.value = emailList ? value.join(", ") : value === null ? "" : complex ? JSON.stringify(value, null, 2) : String(value);
        input.required = key === requiredField;
        input.maxLength = 20000;
      }
      if (dateFields.has(key)) {
        input.placeholder = "YYYY-MM-DD; leave blank if unknown";
        const dateHint = document.createElement("small");
        dateHint.textContent = "留空表示日期未知；无需输入 null。 / Leave blank for an unknown date.";
        label.append(caption, input, dateHint);
      } else label.append(caption, input);
      editor.append(label);
      fields.push({ key, value, input, complex, emailList });
    });
    const actions = document.createElement("div");
    actions.className = "personalReviewActions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", onCancel);
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save changes";
    actions.append(cancel, save);
    editor.append(error, actions);
    editor.addEventListener("submit", async event => {
      event.preventDefault();
      if (save.disabled) return;
      error.hidden = true;
      try {
        const edited = { ...original };
        fields.forEach(({ key, value, input, complex, emailList }) => {
          const text = input.value.trim();
          if (key === requiredField && !text) throw new Error("Please fill in " + (labels[key] || key) + ".");
          if (dateFields.has(key) && (!text || text.toLowerCase() === "null")) edited[key] = null;
          else if (typeof value === "boolean") edited[key] = input.checked;
          else if (emailList) edited[key] = text ? text.split(",").map(item => item.trim()).filter(Boolean) : [];
          else if (complex) {
            let parsed;
            try { parsed = JSON.parse(text); } catch { throw new Error("Please enter valid JSON for " + (labels[key] || key) + "."); }
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) !== Array.isArray(value)) throw new Error("Keep the original object or list format for " + (labels[key] || key) + ".");
            edited[key] = parsed;
          } else if (typeof value === "number") {
            if (!text || !Number.isFinite(Number(text))) throw new Error("Please enter a number for " + (labels[key] || key) + ".");
            edited[key] = Number(text);
          } else edited[key] = value === null && !text ? null : input.value;
        });
        editor.querySelectorAll("button, textarea, input").forEach(control => { control.disabled = true; });
        save.textContent = "Saving…";
        const result = await NetworkAPI.reviewPendingChange(change.id, "edit", edited);
        await onSaved(result);
      } catch (failure) {
        error.textContent = failure.message || "Could not save your changes.";
        error.hidden = false;
        editor.querySelectorAll("button, textarea, input").forEach(control => { control.disabled = false; });
        save.textContent = "Save changes";
      }
    });
    return editor;
  };
  const loadReviews = async () => {
    if (editingReviewId) return;
    try {
      const result = await NetworkAPI.listPendingChanges();
      if (editingReviewId) return;
      const changes = result.changes || [];
      reviewCount.textContent = String(changes.length);
      reviewList.replaceChildren();
      if (!changes.length) {
        const empty = document.createElement("p");
        empty.className = "personalEmptyReview";
        empty.textContent = "No changes are waiting for review.";
        reviewList.append(empty);
        return;
      }
      changes.forEach((change) => {
        const card = document.createElement("article");
        card.className = "personalReviewCard";
        const type = document.createElement("p");
        type.className = "personalKicker";
        type.textContent = change.change_type.replaceAll("_", " ");
        const payload = document.createElement("pre");
        const external=["draft_email","create_calendar_event"].includes(change.change_type);
        if(external){
          const p=change.payload_json;
          payload.textContent=change.change_type==="draft_email"
            ? "To: "+p.to_email+(p.cc?.length?"\nCc: "+p.cc.join(", "):"")+(p.bcc?.length?"\nBcc: "+p.bcc.join(", "):"")+"\nSubject: "+p.subject+"\n\n"+p.body
            : p.title+"\n"+p.start_local+" → "+p.end_local+" ("+p.time_zone+")\n"+(p.location || "")+"\n"+(p.description || "")+"\nGuests: "+(p.attendees || []).join(", ")+"\nInvite notifications: "+(p.send_updates==="all"?"Yes":"No");
          const hint=document.createElement("p");hint.className="personalEditHint";
          hint.textContent=change.change_type==="draft_email"?(change.google_action?.state==="prepared"?"Saved in Gmail drafts. Approval sends the contents shown here; Gmail-side edits will be replaced.":"Not yet ready in Gmail. Prepare the draft before approval."):"Preview only. Approval creates this event in your primary Google Calendar.";
          card.append(hint);
        }else payload.textContent = JSON.stringify(change.payload_json, null, 2);
        if (change.error_message) {
          const error = document.createElement("p");
          error.className = "personalReviewError";
          error.textContent = change.error_message;
          card.append(error);
        }
        const actions = document.createElement("div");
        actions.className = "personalReviewActions";
        const commitAction = change.status === "pending"
          ? [change.change_type==="draft_email"?"Approve & send":change.change_type==="create_calendar_event"?"Approve & create event":"Approve & save", "approved"]
          : [change.status === "failed" ? "Retry" : "Commit", "retry"];
        if (change.status === "pending" || change.status === "failed") {
          const edit = document.createElement("button");
          edit.type = "button";
          edit.textContent = "Edit"; edit.disabled = ["preparing", "executing", "uncertain"].includes(change.google_action?.state);
          edit.addEventListener("click", () => {
            if (editingReviewId) {
              showNotice("Save or cancel your current edit first.");
              return;
            }
            editingReviewId = change.id;
            const closeEditor = () => {
              editingReviewId = null;
              editor.remove();
              payload.hidden = false;
              actions.hidden = false;
              edit.focus();
            };
            const editor = makeReviewEditor(change, async result => {
              editingReviewId = null;
              showNotice(result.message || "Changes saved. Review them before approving.");
              await loadReviews();
            }, closeEditor);
            payload.hidden = true;
            actions.hidden = true;
            card.append(editor);
            editor.querySelector("textarea, input")?.focus();
          });
          actions.append(edit);
        }
        if(change.change_type==="draft_email" && (!change.google_action || change.google_action.state==="failed")){
          const prepare=document.createElement("button");prepare.type="button";prepare.textContent="Prepare in Gmail";
          prepare.addEventListener("click",async()=>{prepare.disabled=true;try{const result=await NetworkAPI.prepareGmailDraft(change.id);showNotice(result.message);await loadReviews();}catch(error){showNotice(error.message,true);prepare.disabled=false;}});actions.append(prepare);
        }
        const uncertain=change.google_action && ["preparing","executing","uncertain"].includes(change.google_action.state);
        if(uncertain){const hint=document.createElement("p");hint.className="personalReviewError";hint.textContent="Check Gmail or Calendar: the previous request may already have completed. Automatic retry is blocked.";card.append(hint);}
        const reviewActions = change.status === "approved" ? [commitAction] : [["Reject", "rejected"], commitAction];
        reviewActions.forEach(([label, value]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          if(uncertain && value!=="rejected")button.disabled=true;
          button.addEventListener("click", async () => {
            if (editingReviewId) {
              showNotice("Save or cancel your current edit first.");
              return;
            }
            actions.querySelectorAll("button").forEach(control => { control.disabled = true; });
            try {
              const result = await NetworkAPI.reviewPendingChange(change.id, value, undefined, external?change.payload_json:undefined);
              window.dispatchEvent(new CustomEvent("personal-os:records-changed"));
              showNotice(result.message || "Review saved.");
              await loadReviews();
            } catch (error) {
              showNotice(error.message || "Could not update this review.", true);
              button.disabled = false;
              await loadReviews();
            }
          });
          actions.append(button);
        });
        card.append(type, payload, actions);
        reviewList.append(card);
      });
    } catch (error) {
      reviewList.textContent = error.message || "Review queue is unavailable.";
    }
  };

  const loadConversation = async () => {
    if (saving || switchingConversation) return;
    switchingConversation = true;
    const epoch = ++conversationEpoch;
    newConversationButton.disabled = true;
    sendButton.disabled = true;
    status.textContent = "CONNECTING";
    try {
      const result = await NetworkAPI.listConversations();
      const latest = result.conversations?.[0];
      const messageResult = latest ? await NetworkAPI.listMessages(latest.id) : { messages: [] };
      if (epoch !== conversationEpoch) return;
      conversationId = latest?.id || null;
      messagesElement.replaceChildren();
      (messageResult.messages || []).forEach(message => addMessage(message, message.role));
      status.textContent = "CONNECTED · SAVING ON";
      await loadReviews();
    } catch (error) {
      if (epoch !== conversationEpoch) return;
      status.textContent = "CONNECTION ISSUE";
      showNotice(error.message || "Could not load this conversation.", true);
    } finally {
      if (epoch === conversationEpoch) {
        switchingConversation = false;
        newConversationButton.disabled = saving;
        sendButton.disabled = saving || !draft.value.trim();
      }
    }
  };

  newConversationButton.addEventListener("click", async () => {
    if (saving || switchingConversation) return;
    switchingConversation = true;
    const epoch = ++conversationEpoch;
    const previousStatus = status.textContent;
    newConversationButton.disabled = true;
    newConversationButton.textContent = "Starting…";
    sendButton.disabled = true;
    showNotice("");
    try {
      // Persist the new conversation first; a failed request keeps the old chat intact.
      const conversation = await NetworkAPI.createConversation("New conversation");
      if (epoch !== conversationEpoch) return;
      if (!conversation || typeof conversation.id !== "string" || !conversation.id) throw new Error("Could not start a conversation.");
      conversationId = conversation.id;
      messagesElement.replaceChildren();
      status.textContent = "CONNECTED · SAVING ON";
      showNotice("New conversation started. Your saved memories are available here.");
      draft.focus();
    } catch (error) {
      if (epoch !== conversationEpoch) return;
      status.textContent = previousStatus;
      showNotice(error.message || "Could not start a conversation.", true);
    } finally {
      if (epoch === conversationEpoch) {
        switchingConversation = false;
        newConversationButton.disabled = false;
        newConversationButton.textContent = "New conversation +";
        sendButton.disabled = !draft.value.trim();
      }
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = draft.value.trim();
    if (!content || saving || switchingConversation) return;
    setLoading(true);
    showNotice("");
    try {
      if (!conversationId) {
        const conversation = await NetworkAPI.createConversation(content.slice(0, 72));
        conversationId = conversation.id;
      }
      const result = await NetworkAPI.sendMessage(conversationId, content);
      addMessage(result.userMessage, "user");
      if (result.assistantMessage) addMessage(result.assistantMessage, "assistant");
      draft.value = "";
      status.textContent = "CONNECTED · SAVING ON";
      if (result.pendingChanges?.length) await loadReviews();
      showNotice(result.warning || (result.pendingChanges?.length ? `Agent replied. ${result.pendingChanges.length} item(s) are waiting for your review.` : "Agent replied and saved this conversation."), Boolean(result.warning));
      messagesElement.scrollTop = messagesElement.scrollHeight;
    } catch (error) {
      showNotice(error.message || "Could not save your message.", true);
    } finally {
      setLoading(false);
    }
  });

  draft.addEventListener("input", () => {
    if (!saving && !switchingConversation) sendButton.disabled = !draft.value.trim();
  });

  document.getElementById("personalSignOut").addEventListener("click", () => {
    document.querySelector(".settingsSignOut")?.click();
  });

  document.querySelectorAll("[data-personal-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const review = tab.dataset.personalTab === "review";
      document.querySelectorAll("[data-personal-tab]").forEach((item) => {
        item.classList.toggle("isActive", item === tab);
        item.setAttribute("aria-selected", String(item === tab));
      });
      contextPanel.hidden = review;
      reviewPanel.hidden = !review;
      if (review) void loadReviews();
    });
  });

  window.addEventListener("personal-os:signed-out", () => {
    conversationEpoch += 1;
    switchingConversation = false;
    newConversationButton.disabled = true;
    newConversationButton.textContent = "New conversation +";
    conversationId = null;
    editingReviewId = null;
    draft.value = "";
    messagesElement.replaceChildren();
    reviewList.replaceChildren();
    reviewCount.textContent = "0";
    showNotice("");
  });
  window.addEventListener("personal-os:ready", () => {
    workspace.hidden = false;
    workspace.setAttribute("aria-hidden", "false");
    void loadConversation();
    void refreshGoogle();
  });
})();

