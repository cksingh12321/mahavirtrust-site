// ============================================================
// Mahavir Trust CMS — dashboard
//
// Talks to three serverless endpoints (all cookie-authenticated):
//   GET  /api/admin-session                       → who am I
//   GET  /api/admin-content?collection=news|blog|press → entries
//   PUT  /api/admin-content?collection=...         → save entries
//   POST /api/admin-logout                         → sign out
//
// No framework, no build step — plain DOM. The whole array for the
// active collection lives in `state.entries`; every save PUTs the
// complete array back (the API commits it to GitHub, Vercel redeploys).
// ============================================================

(function () {
  "use strict";

  // ---- DOM handles -------------------------------------------------
  const app = document.getElementById("app");
  const whoEl = document.getElementById("who");
  const logoutBtn = document.getElementById("logout-btn");
  const tabBtns = Array.from(document.querySelectorAll(".tabs button"));
  const tabTitle = document.getElementById("tab-title");
  const tabSub = document.getElementById("tab-sub");
  const reloadBtn = document.getElementById("reload-btn");
  const addBtn = document.getElementById("add-btn");
  const entriesEl = document.getElementById("entries");
  const toastEl = document.getElementById("toast");

  // ---- helpers -----------------------------------------------------
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const gotoLogin = () => location.replace("/admin/login.html");

  let toastTimer;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "toast is-visible" + (kind ? " is-" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.className = "toast";
    }, 4000);
  }

  // ---- collection schemas -----------------------------------------
  // Each `fields` row is an array of 1–2 field defs (rendered side by
  // side when there are two). Fields without `required: false` are
  // mandatory. Order/labels mirror the old Decap config.yml so the
  // public content-loader keeps rendering identically.
  const LANG = {
    name: "lang",
    label: "Language",
    type: "select",
    default: "en",
    options: [
      ["en", "English"],
      ["hi", "Hindi (हिन्दी)"],
    ],
  };

  const SCHEMAS = {
    news: {
      key: "news",
      title: "Trust News",
      sub: "Official announcements, milestones and event reports.",
      fields: [
        [
          LANG,
          {
            name: "category",
            label: "Category",
            type: "select",
            default: "event",
            options: [
              ["event", "Event"],
              ["milestone", "Milestone"],
              ["story", "Story"],
            ],
          },
        ],
        [{ name: "date", label: "Date", type: "date" }],
        [{ name: "title", label: "Headline", type: "text" }],
        [
          {
            name: "excerpt",
            label: "Short excerpt (2–3 lines, shown on the card)",
            type: "textarea",
          },
        ],
        [
          {
            name: "image",
            label: "Hero photo URL (optional)",
            type: "text",
            required: false,
            hint: "e.g. /assets/img/uploads/event.jpg",
          },
        ],
        [
          {
            name: "body",
            label: "Full body (optional, Markdown — expands on the card)",
            type: "textarea",
            big: true,
            required: false,
          },
        ],
      ],
    },

    blog: {
      key: "blog",
      title: "Blog",
      sub: "Long-form essays and field notes.",
      fields: [
        [
          LANG,
          {
            name: "category",
            label: "Kind",
            type: "select",
            default: "essay",
            options: [
              ["essay", "Essay"],
              ["field-note", "Field note"],
              ["story", "Story"],
            ],
          },
        ],
        [
          { name: "date", label: "Date", type: "date" },
          {
            name: "author",
            label: "Author",
            type: "text",
            default: "Dr. Binod Kumar Singh",
          },
        ],
        [{ name: "title", label: "Headline", type: "text" }],
        [
          {
            name: "excerpt",
            label: "Short excerpt (2–3 lines)",
            type: "textarea",
          },
        ],
        [
          {
            name: "image",
            label: "Hero photo URL (optional)",
            type: "text",
            required: false,
            hint: "e.g. /assets/img/uploads/essay.jpg",
          },
        ],
        [
          {
            name: "body",
            label: "Full essay body (Markdown)",
            type: "textarea",
            big: true,
          },
        ],
      ],
    },

    press: {
      key: "press",
      title: "Press",
      sub: "Newspaper and magazine coverage of the Trust.",
      fields: [
        [LANG, { name: "date", label: "Date", type: "date" }],
        [
          {
            name: "publication",
            label: "Publication",
            type: "text",
            hint: "e.g. The Times of India · Patna",
          },
        ],
        [{ name: "title", label: "Headline", type: "text" }],
        [{ name: "excerpt", label: "Excerpt / pull-quote", type: "textarea" }],
        [
          {
            name: "url",
            label: "Online article URL (optional)",
            type: "text",
            required: false,
            hint: "Full https:// link to the article",
          },
        ],
        [
          {
            name: "image",
            label: "Clipping photo URL (optional)",
            type: "text",
            required: false,
            hint: "e.g. /assets/img/uploads/clipping.jpg",
          },
        ],
      ],
    },
  };

  const flatFields = (schema) => schema.fields.reduce((a, r) => a.concat(r), []);

  // ---- state -------------------------------------------------------
  const state = { tab: "news", entries: [], busy: false };

  // ---- rendering ---------------------------------------------------
  function fieldControl(field, value) {
    const v = value == null ? field.default || "" : value;
    if (field.type === "select") {
      const opts = field.options
        .map(
          ([val, lab]) =>
            `<option value="${esc(val)}"${
              String(val) === String(v) ? " selected" : ""
            }>${esc(lab)}</option>`
        )
        .join("");
      return `<select data-name="${field.name}">${opts}</select>`;
    }
    if (field.type === "textarea") {
      const style = field.big ? ' style="min-height:160px"' : "";
      return `<textarea data-name="${field.name}"${style}>${esc(v)}</textarea>`;
    }
    const inputType = field.type === "date" ? "date" : "text";
    return `<input type="${inputType}" data-name="${field.name}" value="${esc(
      v
    )}">`;
  }

  function fieldBlock(field, value) {
    return `<div class="field">
      <label>${esc(field.label)}</label>
      ${fieldControl(field, value)}
      ${field.hint ? `<span class="hint">${esc(field.hint)}</span>` : ""}
    </div>`;
  }

  function rowBlock(fields, entry) {
    if (fields.length === 1) return fieldBlock(fields[0], entry[fields[0].name]);
    return `<div class="field-row">${fields
      .map((f) => fieldBlock(f, entry[f.name]))
      .join("")}</div>`;
  }

  function cardHtml(entry, index, schema) {
    const isNew = index === null;
    const title = entry.title || (isNew ? "New entry" : "Untitled");
    const metaBits = [];
    if (entry.date) metaBits.push(esc(fmtDate(entry.date)));
    if (schema.key === "press" && entry.publication)
      metaBits.push(esc(entry.publication));
    else if (entry.category) metaBits.push(esc(entry.category));

    const rows = schema.fields.map((r) => rowBlock(r, entry)).join("");
    const ref = isNew ? 'data-new="1"' : `data-index="${index}"`;

    return `<div class="entry${isNew ? " is-new is-open" : ""}" ${ref}>
      <div class="entry-head">
        <div class="entry-title">
          <h3>${esc(title)}</h3>
          <div class="entry-meta">${metaBits.join(" · ") || "No date set"}</div>
        </div>
        <div class="entry-actions">
          <button class="btn btn-danger btn-del" type="button">${
            isNew ? "Discard" : "Delete"
          }</button>
        </div>
      </div>
      <div class="entry-body">
        ${rows}
        <div class="entry-save-row">
          <button class="btn btn-saffron btn-save" type="button">Save entry</button>
        </div>
      </div>
    </div>`;
  }

  function render() {
    const schema = SCHEMAS[state.tab];
    state.entries.sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    if (!state.entries.length) {
      entriesEl.innerHTML = `<div class="empty">No entries yet. Click <strong>+ Add entry</strong> to create the first one.</div>`;
      return;
    }
    entriesEl.innerHTML = state.entries
      .map((e, i) => cardHtml(e, i, schema))
      .join("");
  }

  // ---- read a card's inputs back into an entry object -------------
  function readCard(cardEl, schema) {
    const obj = {};
    flatFields(schema).forEach((f) => {
      const el = cardEl.querySelector(`[data-name="${f.name}"]`);
      if (!el) return;
      let val = el.value;
      if (typeof val === "string") val = val.trim();
      // Drop empty optional fields so we don't write "" keys
      if (val === "" && f.required === false) return;
      obj[f.name] = val;
    });
    return obj;
  }

  // ---- network -----------------------------------------------------
  async function loadEntries() {
    entriesEl.innerHTML = `<div class="spinner-block">Loading…</div>`;
    try {
      const r = await fetch(`/api/admin-content?collection=${state.tab}`, {
        cache: "no-store",
      });
      if (r.status === 401) return gotoLogin();
      const data = await r.json().catch(() => ({ entries: [] }));
      if (!r.ok) throw new Error(data.error || `Load failed (${r.status})`);
      state.entries = Array.isArray(data.entries) ? data.entries : [];
      render();
    } catch (e) {
      entriesEl.innerHTML = `<div class="empty">Could not load entries.<br><small>${esc(
        e.message || e
      )}</small></div>`;
    }
  }

  async function persist(verb) {
    if (state.busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin-content?collection=${state.tab}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: state.entries }),
      });
      if (r.status === 401) return gotoLogin();
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Save failed (${r.status})`);
      render();
      const commit = data.commit ? `commit ${data.commit} · ` : "";
      toast(`${verb} · ${commit}live in ~30s`, "success");
    } catch (e) {
      toast(e.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function setBusy(b) {
    state.busy = b;
    [addBtn, reloadBtn].forEach((btn) => (btn.disabled = b));
  }

  // ---- actions -----------------------------------------------------
  async function saveEntry(cardEl) {
    const schema = SCHEMAS[state.tab];
    const obj = readCard(cardEl, schema);
    if (!obj.title) {
      toast("A headline is required", "error");
      return;
    }
    if (!obj.date) {
      toast("A date is required", "error");
      return;
    }
    if (cardEl.dataset.new === "1") {
      state.entries.unshift(obj);
    } else {
      const i = Number(cardEl.dataset.index);
      state.entries[i] = obj;
    }
    await persist("Saved");
  }

  async function deleteEntry(cardEl) {
    if (cardEl.dataset.new === "1") {
      cardEl.remove();
      if (!entriesEl.children.length) render();
      return;
    }
    const i = Number(cardEl.dataset.index);
    const e = state.entries[i];
    const ok = window.confirm(
      `Delete "${(e && e.title) || "this entry"}"? This cannot be undone.`
    );
    if (!ok) return;
    state.entries.splice(i, 1);
    await persist("Deleted");
  }

  function addEntry() {
    const schema = SCHEMAS[state.tab];
    const blank = {};
    flatFields(schema).forEach((f) => {
      if (f.default) blank[f.name] = f.default;
    });
    blank.date = todayISO();
    const empty = entriesEl.querySelector(".empty");
    if (empty) entriesEl.innerHTML = "";
    entriesEl.insertAdjacentHTML("afterbegin", cardHtml(blank, null, schema));
    const card = entriesEl.firstElementChild;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const firstInput = card.querySelector("input, textarea, select");
    if (firstInput) firstInput.focus();
  }

  function switchTab(tab) {
    if (!SCHEMAS[tab]) return;
    state.tab = tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const schema = SCHEMAS[tab];
    tabTitle.textContent = schema.title;
    tabSub.textContent = schema.sub;
    loadEntries();
  }

  async function logout() {
    try {
      await fetch("/api/admin-logout", { method: "POST" });
    } catch (_) {
      /* ignore — redirect regardless */
    }
    gotoLogin();
  }

  // ---- event wiring ------------------------------------------------
  entriesEl.addEventListener("click", (ev) => {
    const card = ev.target.closest(".entry");
    if (!card) return;
    if (ev.target.closest(".btn-del")) {
      ev.stopPropagation();
      deleteEntry(card);
      return;
    }
    if (ev.target.closest(".btn-save")) {
      saveEntry(card);
      return;
    }
    if (ev.target.closest(".entry-head")) {
      card.classList.toggle("is-open");
    }
  });

  // Live-update the card heading as the headline is typed
  entriesEl.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.name === "title") {
      const card = el.closest(".entry");
      const h3 = card && card.querySelector(".entry-title h3");
      if (h3) h3.textContent = el.value.trim() || "Untitled";
    }
  });

  // ---- boot --------------------------------------------------------
  async function init() {
    try {
      const r = await fetch("/api/admin-session", { cache: "no-store" });
      if (r.status !== 200) return gotoLogin();
      const data = await r.json().catch(() => ({}));
      whoEl.textContent = data.email || "";
    } catch (_) {
      return gotoLogin();
    }

    app.hidden = false;
    tabBtns.forEach((b) =>
      b.addEventListener("click", () => switchTab(b.dataset.tab))
    );
    addBtn.addEventListener("click", addEntry);
    reloadBtn.addEventListener("click", loadEntries);
    logoutBtn.addEventListener("click", logout);

    switchTab("news");
  }

  init();
})();
