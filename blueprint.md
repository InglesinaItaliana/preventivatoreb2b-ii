# Project Blueprint

## Overview

This is a standard Vue.js project initialized with Vite. It's set up to use TypeScript and the Composition API.

## Project Structure and Features

- **Vue Router:** The project uses Vue Router for client-side routing.
  - The router is configured in `src/router.ts`.
  - The main application component (`src/App.vue`) uses `<RouterView />` to display routed content.
- **Login Page:** A stylish login page is available at the root URL (`/`).
  - The login view is defined in `src/views/LoginView.vue`.
  - It includes a form with a single field for the VAT number (`Partita IVA`).
  - On successful login, the user is redirected to the `/preventivatore` route.
- **Builder Page:** A fully functional builder page for the `preventivatore` is available at `/preventivatore`.
  - The view is defined in `src/views/BuilderView.vue`.
- **Styling:** The project uses Tailwind CSS for styling.
- **Data Management:** The project uses Pinia for state management and `papaparse` to parse CSV data.
  - The `src/Data/catalog.ts` file defines a Pinia store that fetches and processes data from a Google Sheet. It now correctly handles asynchronous data loading, preventing race conditions that caused the UI to render with incomplete data.
  - The data is then used to populate the `BuilderView.vue` component.
- **UI/UX Improvements:**
  - **Auto-selection:** The `BuilderView.vue` component now features an intelligent auto-selection mechanism. If a selection in a dropdown menu results in only one available option in the subsequent dropdown, that option is automatically selected. This streamlines the user's workflow and provides a more intuitive experience.
  - **Filtered Categories:** The "Griglia" section now exclusively displays the `INGLESINA`, `DUPLEX`, and `MUNTIN` categories, providing a more focused selection process.
- **Types:** The project uses custom types defined in `src/types.ts`.

## Current Plan

This was the plan for the latest changes:

1.  **Critical Bug Fix & Refinement:**
    *   **Race Condition Fix:** Corrected a critical race condition in `src/Data/catalog.ts` where the loading state was not managed correctly, causing the UI to render before data was fully loaded.
    *   **UI Logic Refinement:** Refined the logic in `src/views/BuilderView.vue` to be more robust and ensure correct population of the dropdown lists.
2.  **Update `blueprint.md`**: Update the blueprint to document the critical bug fix and refinements.
