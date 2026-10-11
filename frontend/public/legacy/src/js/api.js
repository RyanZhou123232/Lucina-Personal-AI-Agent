(() => {
  const getClient = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const client = window.parent.__PERSONAL_OS__?.supabase;
      if (client) return client;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error("Supabase is not configured. Check frontend/.env.local and restart the development server.");
  };

  const request = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  };

  window.NetworkAPI = {
    async getSession() {
      const { data, error } = await (await getClient()).auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async getUserId() {
      const { data, error } = await (await getClient()).auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    async signIn(email, password) {
      return (await getClient()).auth.signInWithPassword({ email, password });
    },
    async signUp(email, password, displayName) {
      return (await getClient()).auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
    },
    async signOut() {
      return (await getClient()).auth.signOut();
    },
    async listConversations() {
      return request("/api/conversations");
    },
    async createConversation(title) {
      return request("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
    async listMessages(conversationId) {
      return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
    },
    async sendMessage(conversationId, content) {
      return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
    },
    async listPeople() { return request("/api/people"); },
    async updatePerson(id, changes) { return request(`/api/people/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) }); },
    async listTasks() {
      return request("/api/tasks");
    },
    async updateTask(id, changes) {
      return request(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
    },
    async googleStatus() {return request("/api/google/status");},
    async connectGoogle(){return request("/api/google/connect",{method:"POST",body:JSON.stringify({time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone})});},
    async disconnectGoogle(){return request("/api/google/status",{method:"DELETE"});},
    async prepareGmailDraft(id){return request("/api/google/drafts/"+encodeURIComponent(id),{method:"POST"});},
    async listPendingChanges() {
      return request("/api/pending-changes");
    },
    async reviewPendingChange(id, status, payload, expectedPayload) {
      return request(`/api/pending-changes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(payload === undefined ? {} : { payload }), ...(expectedPayload===undefined?{}:{expected_payload:expectedPayload}) }),
      });
    },
  };
})();



