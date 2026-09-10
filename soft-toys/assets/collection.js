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

let toys = [];

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

function imageMarkup(toy, className = "") {
  if (!toy.image) {
    return `<div class="photo-placeholder ${className}" aria-label="No photo available">♡</div>`;
  }
  return `<img class="${className}" src="./images/${encodeURIComponent(toy.image)}" alt="${escapeHtml(toy.name)}">`;
}

function cardMarkup(toy) {
  const firstFact = toy.funFacts?.[0] ? `<p class="fact-preview">${escapeHtml(toy.funFacts[0])}</p>` : "";
  const official = toy.officialModel ? `<p class="official-name">${escapeHtml(toy.officialModel)}</p>` : "";

  return `
    <article class="toy-card">
      <button class="card-button" type="button" data-toy-id="${escapeHtml(toy.id)}" aria-label="Open details for ${escapeHtml(toy.name)}">
        <div class="photo-wrap">${imageMarkup(toy)}</div>
        <div class="card-body">
          <div class="card-date">Joined ${escapeHtml(displayDate(toy.dateAdded))}</div>
          <h2 class="toy-name">${escapeHtml(toy.name)}</h2>
          ${official}
          ${firstFact}
          <span class="more-link">open scrapbook note →</span>
        </div>
      </button>
    </article>`;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = toys.filter((toy) => {
    const haystack = [toy.name, toy.officialModel, ...(toy.funFacts || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  visible.sort((a, b) => {
    switch (sortSelect.value) {
      case "added-asc": return sortableDate(a.dateAdded).localeCompare(sortableDate(b.dateAdded));
      case "name-asc": return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      default: return sortableDate(b.dateAdded).localeCompare(sortableDate(a.dateAdded));
    }
  });

  grid.innerHTML = visible.map(cardMarkup).join("");
  const label = `${visible.length} soft toy${visible.length === 1 ? "" : "s"}`;
  count.textContent = query ? `${label} found` : label;
  footerCount.textContent = `${toys.length} in the collection`;

  emptyState.hidden = toys.length !== 0;
  noResults.hidden = !(toys.length > 0 && visible.length === 0);
}

function showToy(id) {
  const toy = toys.find((item) => item.id === id);
  if (!toy) return;

  const facts = toy.funFacts?.length
    ? `<h3 class="facts-title">Little facts</h3><ul class="facts-list">${toy.funFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>`
    : `<h3 class="facts-title">Little facts</h3><p class="dialog-official">No extra notes yet.</p>`;

  dialogContent.innerHTML = `
    ${toy.image ? imageMarkup(toy, "dialog-photo") : `<div class="photo-placeholder dialog-photo" aria-hidden="true">♡</div>`}
    <div class="dialog-copy">
      <div class="dialog-kicker">Joined ${escapeHtml(displayDate(toy.dateAdded))}</div>
      <h2>${escapeHtml(toy.name)}</h2>
      ${toy.officialModel ? `<p class="dialog-official">${escapeHtml(toy.officialModel)}</p>` : ""}
      ${facts}
    </div>`;

  dialog.showModal();
}

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toy-id]");
  if (button) showToy(button.dataset.toyId);
});
searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
dialogClose.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    return response.json();
  })
  .then((data) => {
    toys = Array.isArray(data) ? data : [];
    render();
  })
  .catch((error) => {
    console.error(error);
    grid.innerHTML = `<section class="empty-state" style="grid-column:1/-1"><h2>Collection data could not be loaded</h2><p>Check that <code>soft-toys/data/toys.json</code> exists and contains valid JSON.</p></section>`;
  });
