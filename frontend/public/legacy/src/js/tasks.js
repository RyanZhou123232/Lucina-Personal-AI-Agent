(() => {
  const list = document.getElementById("personalTaskList");
  const feedback = document.getElementById("personalTaskNotice");
  const count = document.getElementById("personalTaskCount");
  const refresh = document.getElementById("personalTaskRefresh");
  const completedToggle = document.getElementById("personalTaskCompleted");
  let tasks = [];
  let editingId = null;
  let busy = false;
  let generation = 0;
  let active = false;

  const tell = (message, error = false) => {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("isError", error);
  };
  const makeButton = (text, action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  };
  const updateTask = async (task, changes) => {
    const result = await NetworkAPI.updateTask(task.id, { ...changes, expectedUpdatedAt: task.updated_at });
    tasks = tasks.map(item => item.id === task.id ? result.task : item);
  };
  const editTask = (task, card, details, actions) => {
    if (busy || editingId) return;
    editingId = task.id;
    const editor = document.createElement("form");
    editor.className = "personalReviewEditor";
    const inputs = {};
    for (const [key, caption, rows] of [["title", "Title", 2], ["description", "Description", 3]]) {
      const label = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = caption;
      const input = document.createElement("textarea");
      input.name = key;
      input.rows = rows;
      input.value = task[key] || "";
      input.required = key === "title";
      input.maxLength = key === "title" ? 500 : 20000;
      inputs[key] = input;
      label.append(name, input);
      editor.append(label);
    }
    const buttons = document.createElement("div");
    buttons.className = "personalReviewActions";
    const cancel = makeButton("Cancel", () => {
      if (busy) return;
      editingId = null;
      tell("");
      render();
    });
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save task";
    buttons.append(cancel, save);
    editor.append(buttons);
    editor.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      if (!inputs.title.value.trim()) { tell("Enter a task title.", true); return; }
      busy = true;
      refresh.disabled = completedToggle.disabled = true;
      editor.querySelectorAll("button, textarea").forEach(control => { control.disabled = true; });
      try {
        await updateTask(task, { title: inputs.title.value.trim(), description: inputs.description.value });
        editingId = null;
        busy = false;
        render();
        tell("Task updated.");
      } catch (error) {
        tell(error.message || "Could not update this task.", true);
        editor.querySelectorAll("button, textarea").forEach(control => { control.disabled = false; });
      } finally {
        busy = false;
        refresh.disabled = false;
        completedToggle.disabled = false;
      }
    });
    details.hidden = actions.hidden = true;
    card.append(editor);
    inputs.title.focus();
  };
  const render = () => {
    if (editingId) return;
    list.replaceChildren();
    const showCompleted = completedToggle.checked;
    const visible = tasks.filter(task => (task.status === "completed") === showCompleted);
    count.textContent = String(tasks.filter(task => task.status !== "completed").length);
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "personalEmptyReview";
      empty.textContent = showCompleted ? "No completed tasks yet." : "No open tasks. Tasks you approve in Review will appear here.";
      list.append(empty);
      return;
    }
    visible.forEach(task => {
      const card = document.createElement("article");
      card.className = "personalTaskCard";
      const details = document.createElement("div");
      const heading = document.createElement("h3");
      heading.textContent = task.title;
      details.append(heading);
      if (task.description) {
        const description = document.createElement("p");
        description.textContent = task.description;
        details.append(description);
      }
      if (task.due_at) {
        const due = document.createElement("p");
        due.className = "personalTaskMeta";
        const date = new Date(task.due_at);
        due.textContent = Number.isFinite(date.getTime()) ? "Due " + date.toLocaleString(undefined, { timeZoneName: "short" }) : "Due date needs correction";
        details.append(due);
      }
      const actions = document.createElement("div");
      actions.className = "personalReviewActions";
      actions.append(makeButton("Edit", () => editTask(task, card, details, actions)));
      actions.append(makeButton(showCompleted ? "Reopen" : "Mark done", async () => {
        if (busy || editingId) { tell("Save or cancel your current edit first."); return; }
        busy = true;
        list.querySelectorAll("button").forEach(button => { button.disabled = true; });
        refresh.disabled = completedToggle.disabled = true;
        try {
          await updateTask(task, { status: showCompleted ? "pending" : "completed" });
          tell(showCompleted ? "Task reopened." : "Task completed.");
        } catch (error) {
          tell(error.message || "Could not update task status.", true);
        } finally {
          busy = false;
          refresh.disabled = completedToggle.disabled = false;
          render();
        }
      }));
      card.append(details, actions);
      list.append(card);
    });
  };
  const load = async () => {
    if (!active || busy || editingId) return;
    const requestGeneration = ++generation;
    refresh.disabled = true;
    try {
      const result = await NetworkAPI.listTasks();
      if (!active || requestGeneration !== generation || busy || editingId) return;
      tasks = result.tasks || [];
      render();
      tell("");
    } catch (error) {
      if (active && requestGeneration === generation) tell(error.message || "Could not load tasks. Try Refresh.", true);
    } finally {
      if (requestGeneration === generation && !busy) refresh.disabled = false;
    }
  };
  refresh.addEventListener("click", () => {
    if (editingId) { tell("Save or cancel your current edit first."); return; }
    void load();
  });
  completedToggle.addEventListener("change", () => {
    if (editingId || busy) {
      completedToggle.checked = !completedToggle.checked;
      tell("Save or cancel your current edit first.");
      return;
    }
    render();
  });
  document.querySelector('[data-personal-tab="context"]').addEventListener("click", () => void load());
  window.addEventListener("personal-os:ready", () => { active = true; void load(); });
  window.addEventListener("personal-os:records-changed", () => void load());
  window.addEventListener("personal-os:signed-out", () => {
    active = false;
    generation += 1;
    tasks = [];
    editingId = null;
    completedToggle.checked = false;
    render();
    tell("");
  });
})();
