const DATA_URL = "./data/toys.json";

const grid = document.querySelector("#collectionGrid");
const count = document.querySelector("#collectionCount");
const footerCount = document.querySelector("#footerCount");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const emptyState = document.querySelector("#emptyState");
const noResults = document.querySelector("#noResults");
const dialog = document.querySelector("#toyDialog");
const dialogContent = document.querySelector("#dialogContent");
const dialogClose = dialog.querySelector(".dialog-close");
const filterButton = document.querySelector("#filterButton");
const filterPanel = document.querySelector("#filterPanel");
const filterGroups = document.querySelector("#filterGroups");
const filterCount = document.querySelector("#filterCount");
const clearFilters = document.querySelector("#clearFilters");
const activeFilterChips = document.querySelector("#activeFilterChips");
const filterMenuWrap = document.querySelector(".filter-menu-wrap");

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

function displayDate(dateAdded) {
  if (!dateAdded?.value) return "Date unknown";
  const { precision = "day", value } = dateAdded;

  if (precision === "year") return value;
  if (precision === "month") {
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function sortableDate(dateAdded) {
  if (!dateAdded?.value) return "0000-00-00";
  const { precision = "day", value } = dateAdded;
  if (precision === "year") return `${value}-00-00`;
  if (precision === "month") return `${value}-00`;
  return value;
}

function yearAdded(toy) {
  const value = toy?.dateAdded?.value;
  const match = typeof value === "string" ? value.match(/^(\d{4})/) : null;
  return match ? match[1] : "";
}

function statusState(toy) {
  const state = toy?.collectionStatus?.state;
  return ["active", "lost", "memory"].includes(state) ? state : "active";
}

function statusLabel(state) {
  if (state === "lost") return "Lost";
  if (state === "memory") return "In Our Memory";
  return "Active";
}

function statusDate(toy) {
  const state = statusState(toy);
  const status = toy.collectionStatus || {};
  if (state === "lost") return status.lostDate || null;
  if (state === "memory") return status.endDate || null;
  return null;
}

function cardDateText(toy) {
  const joined = displayDate(toy.dateAdded);
  const finalDate = statusDate(toy);
  return finalDate?.value
    ? `${joined} – ${displayDate(finalDate)}`
    : `Joined ${joined}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function legacyPosition(toy, viewName) {
  const value = viewName === "profile" ? toy.profilePosition : toy.galleryPosition;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function photoSettings(toy, viewName) {
  const saved = toy.photoDisplay?.[viewName] || {};
  const legacy = legacyPosition(toy, viewName) || {};
  const legacyZoom = viewName === "profile" ? toy.profileZoom : toy.galleryZoom;
  const fit = saved.fit === "contain" ? "contain" : "cover";

  return {
    fit,
    x: clampNumber(saved.x ?? legacy.x, 0, 100, 50),
    y: clampNumber(saved.y ?? legacy.y, 0, 100, 50),
    zoom: fit === "contain" ? 1 : clampNumber(saved.zoom ?? legacyZoom, 1, 1.7, 1)
  };
}

function imageMarkup(toy, className = "", viewName = "gallery") {
  if (!toy.image) {
    return `<div class="photo-placeholder ${className}" aria-label="No photo available">♡</div>`;
  }

  const settings = photoSettings(toy, viewName);
  const style = `object-fit:${settings.fit};object-position:${settings.x}% ${settings.y}%;transform-origin:${settings.x}% ${settings.y}%;transform:scale(${settings.zoom});`;

  return `<img class="${className}" src="./images/${encodeURIComponent(toy.image)}" alt="${escapeHtml(toy.name)}" style="${style}">`;
}

function cardStatusMarkup(toy) {
  const state = statusState(toy);
  if (state === "active") return "";
  return `<div class="card-status card-status-${state}">${escapeHtml(statusLabel(state))}</div>`;
}

function cardMarkup(toy) {
  const firstFact = toy.funFacts?.[0] ? `<p class="fact-preview">${escapeHtml(toy.funFacts[0])}</p>` : "";
  const official = toy.officialModel ? `<p class="official-name">${escapeHtml(toy.officialModel)}</p>` : "";
  const state = statusState(toy);
  const statusClass = state === "active" ? "" : ` status-${state}`;

  return `
    <article class="toy-card${statusClass}">
      <button class="card-button" type="button" data-toy-id="${escapeHtml(toy.id)}" aria-label="Open details for ${escapeHtml(toy.name)}">
        <div class="photo-wrap">
          ${imageMarkup(toy, "", "gallery")}
          ${cardStatusMarkup(toy)}
        </div>
        <div class="card-body">
          <div class="card-date">${escapeHtml(cardDateText(toy))}</div>
          <h2 class="toy-name">${escapeHtml(toy.name)}</h2>
          ${official}
          ${firstFact}
        </div>
      </button>
    </article>`;
}

function searchMatches(toy, query) {
  if (!query) return true;
  const relativeSearchText = (toy.relatives || []).flatMap((relative) => {
    const linkedToy = toys.find((item) => item.id === relative?.toyId);
    return [relative?.relationship, linkedToy?.name];
  });
  const status = toy.collectionStatus || {};
  const haystack = [
    toy.name,
    toy.officialModel,
    toy.species,
    toy.spawnLocation,
    status.lastKnownLocation,
    statusLabel(statusState(toy)),
    status.lostDate?.value,
    status.endDate?.value,
    yearAdded(toy),
    ...(toy.funFacts || []),
    ...relativeSearchText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function uniqueTextValues(values) {
  const byLower = new Map();
  values.forEach((value) => {
    const clean = typeof value === "string" ? value.trim() : "";
    if (clean && !byLower.has(clean.toLocaleLowerCase())) byLower.set(clean.toLocaleLowerCase(), clean);
  });
  return [...byLower.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function filterDefinitions() {
  return [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "lost", label: "Lost" },
        { value: "memory", label: "In Our Memory" }
      ]
    },
    {
      key: "species",
      label: "Species",
      options: uniqueTextValues(toys.map((toy) => toy.species)).map((label) => ({ value: label.toLocaleLowerCase(), label }))
    },
    {
      key: "spawnLocation",
      label: "Spawn Location",
      options: uniqueTextValues(toys.map((toy) => toy.spawnLocation)).map((label) => ({ value: label.toLocaleLowerCase(), label }))
    },
    {
      key: "year",
      label: "Year added",
      options: [...new Set(toys.map(yearAdded).filter(Boolean))]
        .sort((a, b) => b.localeCompare(a))
        .map((value) => ({ value, label: value }))
    }
  ];
}

function filterValueForToy(toy, key) {
  if (key === "status") return statusState(toy);
  if (key === "species") return (toy.species || "").trim().toLocaleLowerCase();
  if (key === "spawnLocation") return (toy.spawnLocation || "").trim().toLocaleLowerCase();
  if (key === "year") return yearAdded(toy);
  return "";
}

function filtersMatch(toy) {
  return Object.entries(selectedFilters).every(([key, selected]) => {
    if (selected.size === 0) return true;
    return selected.has(filterValueForToy(toy, key));
  });
}

function selectedFilterTotal() {
  return Object.values(selectedFilters).reduce((total, selected) => total + selected.size, 0);
}

function renderFilterPanel() {
  filterGroups.innerHTML = filterDefinitions().map((group) => {
    if (group.options.length === 0) return "";
    const options = group.options.map((option) => {
      const checked = selectedFilters[group.key].has(option.value) ? " checked" : "";
      return `
        <label class="filter-option">
          <input type="checkbox" data-filter-key="${escapeHtml(group.key)}" value="${escapeHtml(option.value)}"${checked}>
          <span class="filter-check" aria-hidden="true">✓</span>
          <span>${escapeHtml(option.label)}</span>
        </label>`;
    }).join("");

    return `
      <fieldset class="filter-group">
        <legend>${escapeHtml(group.label)}</legend>
        <div class="filter-options">${options}</div>
      </fieldset>`;
  }).join("");

  updateFilterChrome();
}

function filterLabel(key, value) {
  if (key === "status") return statusLabel(value);
  const group = filterDefinitions().find((definition) => definition.key === key);
  return group?.options.find((option) => option.value === value)?.label || value;
}

function filterGroupLabel(key) {
  if (key === "year") return "Year";
  if (key === "spawnLocation") return "Spawn Location";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function renderFilterChips() {
  const chips = [];
  Object.entries(selectedFilters).forEach(([key, selected]) => {
    selected.forEach((value) => {
      chips.push(`
        <button class="filter-chip" type="button" data-remove-filter-key="${escapeHtml(key)}" data-remove-filter-value="${escapeHtml(value)}">
          <span>${escapeHtml(filterGroupLabel(key))}: ${escapeHtml(filterLabel(key, value))}</span>
          <span class="filter-chip-x" aria-hidden="true">×</span>
        </button>`);
    });
  });
  activeFilterChips.innerHTML = chips.join("");
  activeFilterChips.hidden = chips.length === 0;
}

function updateFilterChrome() {
  const total = selectedFilterTotal();
  filterCount.textContent = total;
  filterCount.hidden = total === 0;
  filterButton.classList.toggle("has-filters", total > 0);
  clearFilters.disabled = total === 0;
  renderFilterChips();
}

function setFilterPanel(open) {
  filterPanel.hidden = !open;
  filterButton.setAttribute("aria-expanded", String(open));
  filterMenuWrap.classList.toggle("is-open", open);
}

function updateEmptyStates(visibleCount, hasConstraints) {
  emptyState.hidden = toys.length !== 0;
  noResults.hidden = !(toys.length > 0 && hasConstraints && visibleCount === 0);
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const hasFilters = selectedFilterTotal() > 0;
  let visible = toys.filter((toy) => searchMatches(toy, query) && filtersMatch(toy));

  visible.sort((a, b) => {
    switch (sortSelect.value) {
      case "added-asc": return sortableDate(a.dateAdded).localeCompare(sortableDate(b.dateAdded));
      case "name-asc": return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      default: return sortableDate(b.dateAdded).localeCompare(sortableDate(a.dateAdded));
    }
  });

  grid.innerHTML = visible.map(cardMarkup).join("");

  const basicLabel = `${visible.length} soft toy${visible.length === 1 ? "" : "s"}`;
  count.textContent = (query || hasFilters) ? `${basicLabel} found` : basicLabel;
  footerCount.textContent = `${toys.length} in the collection`;
  updateFilterChrome();
  updateEmptyStates(visible.length, Boolean(query || hasFilters));
}

function infoMarkup(toy) {
  const items = [];
  const state = statusState(toy);
  const status = toy.collectionStatus || {};

  if (toy.species) {
    items.push(`<div class="profile-info-item"><dt>Species</dt><dd>${escapeHtml(toy.species)}</dd></div>`);
  }
  if (toy.spawnLocation) {
    items.push(`<div class="profile-info-item"><dt>Spawn Location</dt><dd>${escapeHtml(toy.spawnLocation)}</dd></div>`);
  }
  if (state === "lost" && status.lastKnownLocation) {
    items.push(`<div class="profile-info-item"><dt>Last Known Location</dt><dd>${escapeHtml(status.lastKnownLocation)}</dd></div>`);
  }
  return items.length ? `<dl class="profile-info">${items.join("")}</dl>` : "";
}

function profileStatusMarkup(toy) {
  const state = statusState(toy);
  if (state === "active") return "";
  const symbol = state === "lost" ? "⌕" : "♡";
  return `<div class="profile-status profile-status-${state}"><span aria-hidden="true">${symbol}</span>${escapeHtml(statusLabel(state))}</div>`;
}

function relativesMarkup(toy) {
  if (!Array.isArray(toy.relatives) || toy.relatives.length === 0) return "";

  const relatives = toy.relatives
    .filter((relative) => relative && relative.relationship && relative.toyId)
    .map((relative) => {
      const linkedToy = toys.find((item) => item.id === relative.toyId);
      if (!linkedToy) {
        return `<span class="relative-link relative-missing"><span>${escapeHtml(relative.relationship)}</span><strong>Unknown soft toy</strong></span>`;
      }
      return `<button class="relative-link" type="button" data-relative-id="${escapeHtml(linkedToy.id)}"><span>${escapeHtml(relative.relationship)}</span><strong>${escapeHtml(linkedToy.name)}</strong></button>`;
    })
    .join("");

  return relatives
    ? `<section class="relatives-section"><h3 class="facts-title">Relatives</h3><div class="relatives-list">${relatives}</div></section>`
    : "";
}

function showToy(id) {
  const toy = toys.find((item) => item.id === id);
  if (!toy) return;

  const facts = toy.funFacts?.length
    ? `<h3 class="facts-title">Little facts</h3><ul class="facts-list">${toy.funFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>`
    : `<h3 class="facts-title">Little facts</h3><p class="dialog-official">No extra notes yet.</p>`;

  const profilePhoto = toy.image
    ? `<div class="dialog-photo-wrap">${imageMarkup(toy, "dialog-photo", "profile")}</div>`
    : `<div class="photo-placeholder dialog-photo-wrap" aria-hidden="true">♡</div>`;

  dialogContent.innerHTML = `
    ${profilePhoto}
    <div class="dialog-copy">
      <div class="dialog-kicker">${escapeHtml(cardDateText(toy))}</div>
      <h2>${escapeHtml(toy.name)}</h2>
      ${profileStatusMarkup(toy)}
      ${toy.officialModel ? `<p class="dialog-official">${escapeHtml(toy.officialModel)}</p>` : ""}
      ${infoMarkup(toy)}
      ${relativesMarkup(toy)}
      ${facts}
    </div>`;

  if (!dialog.open) dialog.showModal();
}

dialogContent.addEventListener("click", (event) => {
  const relativeButton = event.target.closest("[data-relative-id]");
  if (relativeButton) showToy(relativeButton.dataset.relativeId);
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toy-id]");
  if (button) showToy(button.dataset.toyId);
});

filterButton.addEventListener("click", () => {
  setFilterPanel(filterPanel.hidden);
});

filterGroups.addEventListener("change", (event) => {
  const input = event.target.closest("[data-filter-key]");
  if (!input) return;
  const key = input.dataset.filterKey;
  if (!selectedFilters[key]) return;
  if (input.checked) selectedFilters[key].add(input.value);
  else selectedFilters[key].delete(input.value);
  render();
});

clearFilters.addEventListener("click", () => {
  Object.values(selectedFilters).forEach((set) => set.clear());
  renderFilterPanel();
  render();
});

activeFilterChips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-filter-key]");
  if (!button) return;
  const key = button.dataset.removeFilterKey;
  const value = button.dataset.removeFilterValue;
  selectedFilters[key]?.delete(value);
  renderFilterPanel();
  render();
});

document.addEventListener("click", (event) => {
  if (!filterPanel.hidden && !filterMenuWrap.contains(event.target)) setFilterPanel(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !filterPanel.hidden && !dialog.open) {
    setFilterPanel(false);
    filterButton.focus();
  }
});

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
dialogClose.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

fetch(DATA_URL, { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    return response.json();
  })
  .then((data) => {
    toys = Array.isArray(data) ? data : [];
    renderFilterPanel();
    render();
  })
  .catch((error) => {
    console.error(error);
    grid.innerHTML = `<section class="empty-state" style="grid-column:1/-1"><h2>Collection data could not be loaded</h2><p>Check that <code>soft-toys/data/toys.json</code> exists and contains valid JSON.</p></section>`;
  });
