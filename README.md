# Soft Toy Collection — GitHub Pages site

A static, pastel soft-toy collection website built for GitHub Pages.

## What lives where

- `/index.html` — intentionally plain public landing page (“website in progress”). It does **not** link to the collection.
- `/soft-toys/` — the collection itself.
- `/soft-toys/add/` — a hidden helper form for preparing a new entry on an iPhone.
- `/soft-toys/data/toys.json` — the collection database.
- `/soft-toys/images/` — collection photos.
- `/tools/import_toys.py` — imports files from an iCloud/normal folder into the site.

## Important privacy note

“Hidden” here means **unlinked**, not private. GitHub Pages is public. Someone who knows or guesses `/soft-toys/`, finds it in repository history, or indexes the public repository can still access it. `noindex` tags are included as a request to search engines, but they are not access control.

## 1. Put the site on GitHub Pages

1. Create a GitHub repository named `YOUR-USERNAME.github.io`.
2. Copy all files from this folder into the root of that repository.
3. Commit and push.
4. In the repository on GitHub, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, then select your main branch and `/ (root)`.
6. Your normal home page will be `https://YOUR-USERNAME.github.io/`.
7. Your unlinked collection will be `https://YOUR-USERNAME.github.io/soft-toys/`.
8. Your unlinked add helper will be `https://YOUR-USERNAME.github.io/soft-toys/add/`.

## 2. Recommended iPhone → iCloud → Mac workflow

### One-time setup

On your iPhone, create an iCloud Drive folder named:

`Soft Toy Inbox`

On your Mac, the importer expects that folder here by default:

`~/Library/Mobile Documents/com~apple~CloudDocs/Soft Toy Inbox`

### Each time you add a toy on iPhone

1. Open `https://YOUR-USERNAME.github.io/soft-toys/add/` in Safari. You can add it to your Home Screen for app-like access.
2. Take/choose a photo.
3. Enter the toy's given name, official model/brand, date precision, and fun facts.
4. Tap **Save / share both files**. On iPhone Safari, the preferred path is **Save to Files → iCloud Drive → Soft Toy Inbox**.
5. If your browser does not support sharing both generated files together, use the two fallback buttons and save both files to the same folder.

The photo and entry filenames are linked automatically. Do not rename them.

### Later, on your Mac

The easiest method is to double-click **`Import Soft Toys.command`** in the repository folder. It opens a small Terminal window, runs the importer, and tells you what it added.

If macOS blocks the file the first time because it came from the internet, Control-click it and choose **Open**.

Or, from Terminal inside the repository folder, run:

```bash
python3 tools/import_toys.py
```

The importer:

- reads all pending `.toy-entry.json` files from the iCloud inbox,
- copies each matching photo into `soft-toys/images/`,
- adds each toy to `soft-toys/data/toys.json`,
- moves successfully imported source files into `Soft Toy Inbox/_imported/` so they are not imported twice.

Then open GitHub Desktop, review the changes, commit, and push. GitHub Pages will update automatically.

If you prefer a different inbox folder, pass it as an argument:

```bash
python3 tools/import_toys.py "/path/to/your/folder"
```

## 3. Add entries manually instead

You can also skip the helper/importer and directly edit `soft-toys/data/toys.json` plus add a photo to `soft-toys/images/`.

Example entry:

```json
{
  "id": "marmalade-001",
  "name": "Marmalade",
  "officialModel": "Jellycat Bashful Bunny — Medium",
  "image": "marmalade-001.jpg",
  "dateAdded": {
    "precision": "month",
    "value": "2026-09"
  },
  "funFacts": [
    "Found on a rainy afternoon.",
    "Usually sits on the left side of the bed."
  ]
}
```

Valid date shapes are:

```json
{ "precision": "day", "value": "2026-09-10" }
{ "precision": "month", "value": "2026-09" }
{ "precision": "year", "value": "2026" }
```

## 4. Preview locally before pushing

Because the collection loads its JSON with `fetch()`, opening `soft-toys/index.html` directly as a `file://` page may not work in all browsers. Instead, from the repository root run:

```bash
python3 -m http.server 8000
```

Then visit:

- `http://localhost:8000/`
- `http://localhost:8000/soft-toys/`
- `http://localhost:8000/soft-toys/add/`

Stop the local server with `Control-C`.

## Customization

Most visual styling lives in `soft-toys/assets/styles.css`. The palette is defined at the top in CSS variables (`--cream`, `--blush`, `--sage`, etc.), so changing the look is easy without touching the layout.
