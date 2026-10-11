(() => {
  const list = document.getElementById("personalPeopleList");
  const feedback = document.getElementById("personalPeopleNotice");
  const refresh = document.getElementById("personalPeopleRefresh");
  const search = document.getElementById("personalPeopleSearch");
  let people = [], editingId = null, active = false, busy = false, generation = 0;
  const tell = (message, error = false) => { feedback.textContent = message; feedback.hidden = !message; feedback.classList.toggle("isError", error); };
  const button = (caption, action) => { const node = document.createElement("button"); node.type = "button"; node.textContent = caption; node.addEventListener("click", action); return node; };
  const edit = (person, card, details, actions) => {
    if (editingId || busy) return;
    editingId = person.id;
    refresh.disabled = search.disabled = true;
    const form = document.createElement("form"); form.className = "personalReviewEditor";
    const inputs = {};
    for (const [key, caption, limit] of [["name", "Name", 500], ["notes", "Notes", 20000]]) {
      const label = document.createElement("label"), text = document.createElement("span"), input = document.createElement("textarea");
      text.textContent = caption; input.name = key; input.value = person[key] || ""; input.maxLength = limit; input.rows = key === "name" ? 1 : 4; input.required = key === "name";
      inputs[key] = input; label.append(text, input); form.append(label);
    }
    const controls = document.createElement("div"); controls.className = "personalReviewActions";
    controls.append(button("Cancel", () => { if (busy) return; editingId = null; refresh.disabled = search.disabled = false; render(); tell(""); }));
    const save = document.createElement("button"); save.type = "submit"; save.textContent = "Save person"; controls.append(save); form.append(controls);
    form.addEventListener("submit", async event => {
      event.preventDefault(); if (busy) return;
      if (!inputs.name.value.trim()) { tell("Enter a name.", true); return; }
      busy = true; form.querySelectorAll("button, textarea").forEach(node => node.disabled = true);
      const sessionGeneration = generation;
      try {
        const result = await NetworkAPI.updatePerson(person.id, { name: inputs.name.value, notes: inputs.notes.value, expectedUpdatedAt: person.updated_at });
        if (!active || sessionGeneration !== generation) return;
        people = people.map(item => item.id === person.id ? { ...item, ...result.person } : item);
        editingId = null; render(); tell("Person updated.");
      } catch (error) {
        if (active && sessionGeneration === generation) { tell(error.message || "Could not update this person.", true); form.querySelectorAll("button, textarea").forEach(node => node.disabled = false); }
      } finally { busy = false; if (!editingId) refresh.disabled = search.disabled = false; }
    });
    details.hidden = actions.hidden = true; card.append(form); inputs.name.focus();
  };
  const render = () => {
    if (editingId) return;
    list.replaceChildren();
    const visible = people.filter(person => (person.name + " " + (person.notes || "")).toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
    document.getElementById("personalPeopleCount").textContent = String(people.length);
    if (!visible.length) { const empty = document.createElement("p"); empty.className = "personalEmptyReview"; empty.textContent = search.value ? "No matching people." : "People you approve in Review will appear here."; list.append(empty); }
    for (const person of visible) {
      const card = document.createElement("article"), details = document.createElement("div"), heading = document.createElement("h3"), actions = document.createElement("div");
      card.className = "personalTaskCard"; heading.textContent = person.name; details.append(heading);
      if (person.notes) { const note = document.createElement("p"); note.textContent = person.notes; details.append(note); }
      const history = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Linked interactions (" + person.interactions.length + ")"; history.append(summary);
      if (!person.interactions.length) { const empty = document.createElement("p"); empty.textContent = "No linked interactions yet."; history.append(empty); }
      for (const interaction of person.interactions) {
        const item = document.createElement("p"); item.textContent = [interaction.title || interaction.interaction_type, interaction.summary, interaction.occurred_at ? new Date(interaction.occurred_at).toLocaleString() : ""].filter(Boolean).join("\n"); history.append(item);
      }
      details.append(history); actions.className = "personalReviewActions"; actions.append(button("Edit", () => edit(person, card, details, actions))); card.append(details, actions); list.append(card);
    }
  };
  const load = async () => {
    if (!active || editingId || busy) return;
    const version = ++generation; refresh.disabled = true;
    try { const result = await NetworkAPI.listPeople(); if (active && version === generation && !editingId) { people = result.people || []; render(); tell(""); } }
    catch (error) { if (active && version === generation) tell(error.message || "Could not load people. Try Refresh.", true); }
    finally { if (version === generation && !editingId) refresh.disabled = false; }
  };
  refresh.addEventListener("click", () => void load()); search.addEventListener("input", render);
  document.querySelector('[data-personal-tab="context"]').addEventListener("click", () => void load());
  window.addEventListener("personal-os:ready", () => { active = true; void load(); });
  window.addEventListener("personal-os:records-changed", () => void load());
  window.addEventListener("personal-os:signed-out", () => { active = false; generation++; people = []; editingId = null; search.value = ""; refresh.disabled = search.disabled = false; render(); tell(""); });
})();
