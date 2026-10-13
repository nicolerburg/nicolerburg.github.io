(() => {
  const DATA_URL = "./data/toys.json";

  const els = {
    search: document.querySelector("#searchInput"),
    sort: document.querySelector("#sortSelect"),
    filterButton: document.querySelector("#filterButton"),
    filterPanel: document.querySelector("#filterPanel"),
    filterGroups: document.querySelector("#filterGroups"),
    activeFilters: document.querySelector("#activeFilterChips"),
    clearFilters: document.querySelector("#clearFilters"),
    filterCount: document.querySelector("#filterCount"),
    count: document.querySelector("#collectionCount"),
    footerCount: document.querySelector("#footerCount"),
    gallery: document.querySelector("#collectionGrid"),
    empty: document.querySelector("#emptyState"),
    noResults: document.querySelector("#noResults"),
    dialog: document.querySelector("#toyDialog"),
    dialogContent: document.querySelector("#dialogContent"),
    closeDialog: document.querySelector("#toyDialog .dialog-close")
  };

  let toys = [];
  const selectedFilters = {
    status: new Set(),
    species: new Set(),
    spawnLocation: new Set(),
    year: new Set()
  };

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function slugify(value = "toy") {
    return String(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "toy";
  }

  // Be deliberately generous here so older JSON spellings keep working.
  // Examples supported: memory, in-memory, in_our_memory, in-our-memory,
  // "In Our Memory", memorial.
  function normalizeStatus(value) {
    const compact = String(value || "active")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (compact === "lost") return "lost";
    if (["memory", "inmemory", "inourmemory", "memorial"].includes(compact)) return "memory";
    return "active";
  }

  function normalizeDate(value) {
    if (!value) return null;
    if (typeof value === "string") {
      const raw = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { precision: "day", value: raw };
      if (/^\d{4}-\d{2}$/.test(raw)) return { precision: "month", value: raw };
      if (/^\d{4}$/.test(raw)) return { precision: "year", value: raw };
      return null;
    }
    if (typeof value === "object" && value.value) {
      const raw = String(value.value).trim();
      let precision = String(value.precision || "").toLowerCase();
      if (["exact", "date", "full"].includes(precision)) precision = "day";
      if (!["day", "month", "year"].includes(precision)) {
        precision = /^\d{4}$/.test(raw) ? "year" : /^\d{4}-\d{2}$/.test(raw) ? "month" : "day";
      }
      return { precision, value: raw };
    }
    return null;
  }

  function normalizePhotoDisplay(value) {
    const normalizeOne = (part) => {
      const fit = part?.fit === "contain" ? "contain" : "cover";
      return {
        fit,
        x: Number.isFinite(Number(part?.x)) ? Number(part.x) : 50,
        y: Number.isFinite(Number(part?.y)) ? Number(part.y) : 50,
        zoom: fit === "contain" ? 1 : (Number.isFinite(Number(part?.zoom)) ? Number(part.zoom) : 1)
      };
    };
    return {
      gallery: normalizeOne(value?.gallery),
      profile: normalizeOne(value?.profile)
    };
  }

  function normalizeGallery(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => typeof item === "string" ? item : item?.filename || item?.image || "")
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  function normalizeToy(raw, index) {
    const id = String(raw.id || slugify(raw.name || `toy-${index + 1}`));
    return {
      ...raw,
      id,
      name: String(raw.name || "Unnamed soft toy"),
      officialModel: String(raw.officialModel || raw.model || raw.brandModel || "").trim(),
      image: String(raw.image || raw.photo || "").trim(),
      gallery: normalizeGallery(raw.gallery || raw.galleryImages || raw.galleryPhotos),
      species: String(raw.species || "").trim(),
      spawnLocation: String(raw.spawnLocation || raw.spawn || "").trim(),
      dateAdded: normalizeDate(raw.dateAdded || raw.acquiredDate || raw.joinedDate),
      status: normalizeStatus(raw.status || raw.collectionStatus),
      lastKnownLocation: String(raw.lastKnownLocation || "").trim(),
      lostDate: normalizeDate(raw.lostDate || raw.dateLost),
      endDate: normalizeDate(raw.endDate || raw.memorialDate || raw.dateEnded),
      rejoinDate: normalizeDate(raw.rejoinDate || raw.readdedDate || raw.reAddDate || raw.dateRejoined),
      funFacts: Array.isArray(raw.funFacts || raw.facts) ? (raw.funFacts || raw.facts).map(String).filter(Boolean) : [],
      relatives: Array.isArray(raw.relatives)
        ? raw.relatives
            .map(r => ({
              relationship: String(r.relationship || r.relation || "").trim(),
              toyId: String(r.toyId || r.id || "").trim()
            }))
            .filter(r => r.relationship && r.toyId)
        : [],
      photoDisplay: normalizePhotoDisplay(raw.photoDisplay)
    };
  }

  function formatDate(dateObj) {
    const d = normalizeDate(dateObj);
    if (!d) return "";
    try {
      if (d.precision === "year") return d.value.slice(0, 4);
      if (d.precision === "month") {
        const [year, month] = d.value.split("-").map(Number);
        return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
          .format(new Date(Date.UTC(year, month - 1, 1)));
      }
      const [year, month, day] = d.value.split("-").map(Number);
      return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month - 1, day)));
    } catch {
      return d.value;
    }
  }

  function dateSortValue(dateObj) {
    const d = normalizeDate(dateObj);
    if (!d) return 0;
    if (d.precision === "year") return Number(d.value.slice(0, 4)) * 10000;
    if (d.precision === "month") return Number(d.value.replace("-", "")) * 100;
    return Number(d.value.replaceAll("-", ""));
  }

  function yearAdded(toy) {
    const d = normalizeDate(toy.dateAdded);
    return d?.value?.slice(0, 4) || "";
  }

  function currentEndDate(toy) {
    if (toy.status === "lost") return toy.lostDate || toy.endDate;
    if (toy.status === "memory") return toy.endDate || toy.lostDate;
    if (toy.rejoinDate) return toy.endDate || toy.lostDate;
    return null;
  }

  function fullHistoryText(toy) {
    const start = formatDate(toy.dateAdded);
    const end = formatDate(currentEndDate(toy));
    const rejoin = formatDate(toy.rejoinDate);
    if (rejoin) {
      if (start && end) return `${start} – ${end}, Rejoined ${rejoin}`;
      if (start) return `${start}, Rejoined ${rejoin}`;
      return `Rejoined ${rejoin}`;
    }
    if (start && end) return `${start} – ${end}`;
    if (start) return `Joined ${start}`;
    if (end) return end;
    return "";
  }

  function cardHistoryText(toy) {
    const rejoin = formatDate(toy.rejoinDate);
    if (rejoin) return `Rejoined ${rejoin}`;
    const start = formatDate(toy.dateAdded);
    const end = formatDate(currentEndDate(toy));
    if (start && end) return `${start} – ${end}`;
    return start ? `Joined ${start}` : "";
  }

  function statusLabel(status) {
    if (status === "lost") return "Lost";
    if (status === "memory") return "In Our Memory";
    return "Active";
  }

  function statusIcon(status) {
    if (status === "memory") return "♡";
    if (status === "lost") return "⌖";
    return "";
  }

  function imageStyle(display) {
    const fit = display?.fit === "contain" ? "contain" : "cover";
    const x = Number(display?.x ?? 50);
    const y = Number(display?.y ?? 50);
    const zoom = fit === "contain" ? 1 : Number(display?.zoom ?? 1);
    return `object-fit:${fit};object-position:${x}% ${y}%;transform:scale(${zoom});`;
  }

  function imageMarkup(toy, kind = "gallery", className = "") {
    if (!toy.image) return `<div class="photo-placeholder ${className}" aria-hidden="true">♡</div>`;
    const display = toy.photoDisplay?.[kind] || { fit: "cover", x: 50, y: 50, zoom: 1 };
    return `<img class="${className}" src="./images/${encodeURIComponent(toy.image)}" alt="${escapeHtml(toy.name)}" style="${imageStyle(display)}">`;
  }

  function cardMarkup(toy) {
    const badge = toy.status === "active"
      ? ""
      : `<span class="card-status card-status-${toy.status === "memory" ? "memory" : "lost"}">${escapeHtml(statusLabel(toy.status))}</span>`;
    const history = cardHistoryText(toy);
    return `
      <article class="toy-card">
        <button class="card-button" type="button" data-toy-id="${escapeHtml(toy.id)}" aria-label="Open ${escapeHtml(toy.name)}">
          <div class="photo-wrap">
            ${imageMarkup(toy, "gallery")}
            ${badge}
          </div>
          <div class="card-body">
            ${history ? `<div class="card-date">${escapeHtml(history)}</div>` : ""}
            <h2 class="toy-name">${escapeHtml(toy.name)}</h2>
          </div>
        </button>
      </article>`;
  }

  function matchesSearch(toy, query) {
    if (!query) return true;
    const relativeNames = toy.relatives.map(r => toys.find(t => t.id === r.toyId)?.name || "").join(" ");
    const haystack = [
      toy.name,
      toy.officialModel,
      toy.species,
      toy.spawnLocation,
      toy.lastKnownLocation,
      statusLabel(toy.status),
      ...toy.funFacts,
      ...toy.relatives.map(r => r.relationship),
      relativeNames
    ].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function matchesFilters(toy) {
    const checks = [
      ["status", toy.status],
      ["species", toy.species],
      ["spawnLocation", toy.spawnLocation],
      ["year", yearAdded(toy)]
    ];
    return checks.every(([key, value]) => selectedFilters[key].size === 0 || selectedFilters[key].has(value));
  }

  function filteredToys() {
    const query = els.search?.value.trim() || "";
    const list = toys.filter(toy => matchesSearch(toy, query) && matchesFilters(toy));
    const sort = els.sort?.value || "added-desc";
    list.sort((a, b) => {
      if (sort === "added-asc") return dateSortValue(a.dateAdded) - dateSortValue(b.dateAdded) || a.name.localeCompare(b.name);
      if (sort === "name-asc") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return dateSortValue(b.dateAdded) - dateSortValue(a.dateAdded) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function renderGallery() {
    const list = filteredToys();
    els.gallery.innerHTML = list.map(cardMarkup).join("");

    const countText = `${list.length} soft toy${list.length === 1 ? "" : "s"}`;
    if (els.count) els.count.textContent = countText;
    if (els.footerCount) els.footerCount.textContent = `${toys.length} total`;

    const collectionEmpty = toys.length === 0;
    if (els.empty) els.empty.hidden = !collectionEmpty;
    if (els.noResults) els.noResults.hidden = collectionEmpty || list.length !== 0;
    if (els.gallery) els.gallery.hidden = collectionEmpty || list.length === 0;

    els.gallery.querySelectorAll(".card-button").forEach(button => {
      button.addEventListener("click", () => openToy(button.dataset.toyId));
    });
  }

  function filterOptionsFor(key) {
    if (key === "status") {
      const available = new Set(toys.map(t => t.status));
      return ["active", "lost", "memory"]
        .filter(v => available.has(v))
        .map(v => ({ value: v, label: statusLabel(v) }));
    }
    if (key === "year") {
      return [...new Set(toys.map(yearAdded).filter(Boolean))]
        .sort((a, b) => Number(b) - Number(a))
        .map(v => ({ value: v, label: v }));
    }
    return [...new Set(toys.map(t => t[key]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map(v => ({ value: v, label: v }));
  }

  function renderFilterPanel() {
    const groups = [
      ["status", "Status"],
      ["species", "Species"],
      ["spawnLocation", "Spawn Location"],
      ["year", "Year Added"]
    ];

    els.filterGroups.innerHTML = groups.map(([key, label]) => {
      const options = filterOptionsFor(key);
      if (!options.length) return "";
      return `
        <fieldset class="filter-group">
          <legend>${escapeHtml(label)}</legend>
          <div class="filter-options">
            ${options.map(option => `
              <label class="filter-option">
                <input type="checkbox" data-filter-key="${key}" value="${escapeHtml(option.value)}" ${selectedFilters[key].has(option.value) ? "checked" : ""}>
                <span class="filter-check" aria-hidden="true">✓</span>
                <span>${escapeHtml(option.label)}</span>
              </label>`).join("")}
          </div>
        </fieldset>`;
    }).join("");

    els.filterGroups.querySelectorAll("input[type=checkbox]").forEach(input => {
      input.addEventListener("change", () => {
        const set = selectedFilters[input.dataset.filterKey];
        input.checked ? set.add(input.value) : set.delete(input.value);
        renderActiveFilters();
        renderGallery();
      });
    });
    renderActiveFilters();
  }

  function renderActiveFilters() {
    const labels = { status: "Status", species: "Species", spawnLocation: "Spawn", year: "Year" };
    const chips = [];
    let selectedCount = 0;

    for (const [key, set] of Object.entries(selectedFilters)) {
      selectedCount += set.size;
      for (const value of set) {
        const text = key === "status" ? statusLabel(value) : value;
        chips.push(`
          <button class="filter-chip" type="button" data-key="${key}" data-value="${escapeHtml(value)}">
            ${escapeHtml(labels[key])}: ${escapeHtml(text)} <span class="filter-chip-x" aria-hidden="true">×</span>
          </button>`);
      }
    }

    els.activeFilters.innerHTML = chips.join("");
    els.activeFilters.hidden = chips.length === 0;
    if (els.clearFilters) els.clearFilters.disabled = chips.length === 0;
    if (els.filterCount) {
      els.filterCount.textContent = String(selectedCount);
      els.filterCount.hidden = selectedCount === 0;
    }
    els.filterButton.classList.toggle("has-filters", selectedCount > 0);

    els.activeFilters.querySelectorAll(".filter-chip").forEach(button => {
      button.addEventListener("click", () => {
        selectedFilters[button.dataset.key].delete(button.dataset.value);
        renderFilterPanel();
        renderGallery();
      });
    });
  }

  function relativeMarkup(relative) {
    const target = toys.find(t => t.id === relative.toyId);
    if (!target) {
      return `<span class="relative-link relative-missing"><span>${escapeHtml(relative.relationship)}</span><strong>Unknown toy</strong></span>`;
    }
    return `
      <button type="button" class="relative-link" data-relative-id="${escapeHtml(target.id)}">
        <span>${escapeHtml(relative.relationship)}</span>
        <strong>${escapeHtml(target.name)}</strong>
      </button>`;
  }

  function extraGalleryMarkup(toy) {
    if (!toy.gallery.length) return "";
    return `
      <section class="profile-gallery-section">
        <h3 class="facts-title">Gallery</h3>
        <div class="profile-gallery">
          ${toy.gallery.map(filename => `
            <a class="profile-gallery-item" href="./images/${encodeURIComponent(filename)}" target="_blank" rel="noopener">
              <img src="./images/${encodeURIComponent(filename)}" alt="Another photo of ${escapeHtml(toy.name)}" loading="lazy">
            </a>`).join("")}
        </div>
      </section>`;
  }

  function profileMarkup(toy) {
    const statusBadge = toy.status === "active"
      ? ""
      : `<div class="profile-status profile-status-${toy.status === "memory" ? "memory" : "lost"}"><span aria-hidden="true">${statusIcon(toy.status)}</span>${escapeHtml(statusLabel(toy.status))}</div>`;
    const history = fullHistoryText(toy);

    const info = [];
    if (toy.species) info.push(["Species", toy.species]);
    if (toy.spawnLocation) info.push(["Spawn Location", toy.spawnLocation]);
    if (toy.status === "lost" && toy.lastKnownLocation) info.push(["Last Known Location", toy.lastKnownLocation]);

    return `
      <div class="dialog-photo-wrap">
        ${imageMarkup(toy, "profile", "dialog-photo")}
      </div>
      <div class="dialog-copy">
        ${history ? `<div class="dialog-kicker">${escapeHtml(history)}</div>` : ""}
        <h2>${escapeHtml(toy.name)}</h2>
        ${toy.officialModel ? `<p class="dialog-official">${escapeHtml(toy.officialModel)}</p>` : ""}
        ${statusBadge}

        ${info.length ? `
          <dl class="profile-info">
            ${info.map(([label, value]) => `
              <div class="profile-info-item">
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>`).join("")}
          </dl>` : ""}

        ${toy.relatives.length ? `
          <section class="relatives-section">
            <h3 class="facts-title">Relatives</h3>
            <div class="relatives-list">${toy.relatives.map(relativeMarkup).join("")}</div>
          </section>` : ""}

        ${toy.funFacts.length ? `
          <section>
            <h3 class="facts-title">Fun Facts</h3>
            <ul class="facts-list">${toy.funFacts.map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>
          </section>` : ""}

        ${extraGalleryMarkup(toy)}
      </div>`;
  }

  function resetDialogScroll() {
    els.dialog.scrollTop = 0;
    els.dialogContent.scrollTop = 0;
    requestAnimationFrame(() => {
      els.dialog.scrollTop = 0;
      els.dialogContent.scrollTop = 0;
    });
  }

  function openToy(id) {
    const toy = toys.find(t => t.id === id);
    if (!toy) return;

    els.dialogContent.innerHTML = profileMarkup(toy);
    els.dialogContent.querySelectorAll(".relative-link[data-relative-id]").forEach(button => {
      button.addEventListener("click", () => openToy(button.dataset.relativeId));
    });

    if (!els.dialog.open) els.dialog.showModal();
    resetDialogScroll();
  }

  function closeDialog() {
    if (els.dialog.open) els.dialog.close();
  }

  async function load() {
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load collection (${response.status})`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : Array.isArray(data.toys) ? data.toys : [];
      toys = list.map(normalizeToy);
      renderFilterPanel();
      renderGallery();
    } catch (error) {
      console.error(error);
      els.gallery.innerHTML = `<p class="load-error">I couldn't load the collection data. Try refreshing the page.</p>`;
      if (els.count) els.count.textContent = "0 soft toys";
      if (els.footerCount) els.footerCount.textContent = "0 total";
    }
  }

  els.search?.addEventListener("input", renderGallery);
  els.sort?.addEventListener("change", renderGallery);
  els.filterButton?.addEventListener("click", () => {
    const isOpen = !els.filterPanel.hidden;
    els.filterPanel.hidden = isOpen;
    els.filterButton.setAttribute("aria-expanded", String(!isOpen));
  });
  els.clearFilters?.addEventListener("click", () => {
    Object.values(selectedFilters).forEach(set => set.clear());
    renderFilterPanel();
    renderGallery();
  });
  els.closeDialog?.addEventListener("click", closeDialog);
  els.dialog?.addEventListener("click", event => {
    if (event.target === els.dialog) closeDialog();
  });
  els.dialog?.addEventListener("close", () => {
    els.dialogContent.innerHTML = "";
    els.dialog.scrollTop = 0;
  });

  load();
})();
