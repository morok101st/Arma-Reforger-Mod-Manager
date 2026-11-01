# Interface gallery

These captures show the real current frontend with **fictional demonstration data**, not live accounts, Workshop metadata or production secrets. They describe `main` after 0.2.5 and must not be presented as screenshots of release 0.2.5. The ARMM logo is the existing application asset; no branding replacement was made.

## Workspace

![Dark workspace overview with Version health and mod browser](images/workspace-dark.png)

Global navigation, the active-modset toolbar and four Version health categories. Export order and modset activity remain collapsible below the overview.

## Mod detail

![Dark mod detail with Workshop ID copy and version comparison](images/mod-detail-dark.png)

The Workshop ID has its own copy action. Installed/latest comparison, checks and dependency relationships stay together.

## Modsets

![Modset management with ownership filters and row actions](images/modsets-dark.png)

Names open the workspace; Edit combines name and group permissions. Duplicate/Delete live in additional actions.

## Administration

![Administration Users section with focused section navigation](images/administration-dark.png)

Users, Groups, Discord and Audit log are separate sections. Personal Account settings are accessed independently.

## Light mode and mobile

![Workspace overview in light mode](images/workspace-light.png)

<img src="images/mod-detail-mobile.png" alt="Mobile mod detail with stacked actions and a closed mod-list drawer" width="390" />

The mobile browser opens as a drawer. These viewport captures demonstrate layout; they do not claim physical-device or manual screen-reader certification.

## Reproduce the captures

From `frontend`, install the existing development dependencies and Chromium, start the frontend with the internal API base, then run the capture script in another terminal:

```bash
npm install
npx playwright install --with-deps chromium
VITE_API_BASE_URL=/api npm run dev
```

```bash
cd frontend
ARMM_DOCS_URL=http://localhost:5173 node scripts/capture-docs.cjs
```

The default output is `../docs/images` relative to the working directory; override with `ARMM_DOCS_OUTPUT`. The script intercepts all API reads, rejects mutations/unmocked external requests, fixes locale/timezone/viewport and uses deterministic example data. Desktop captures are 1440×1000; mobile is 390×844. Captures use the application's DOM/CSS, not hand-drawn UI mockups.

`architecture.svg` and `manual-refresh.svg` are editable vector diagrams of code behavior. They complement the screenshots; they are not generated product illustrations. Keep wiki image copies synchronized when publishing documentation.
