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

This is the plan for the requested changes:

1.  **Update "New Job" Button:**
    *   **Modify `ClientDashboard.vue`:** I will edit the `ClientDashboard.vue` component to update the main call-to-action button.
    *   **Change Button Text:** The button text will be changed from "NUOVO PREVENTIVO" to "NUOVA COMMESSA".
    *   **Ensure Black Icon:** I will verify that the plus icon (`PlusIcon`) is black as requested.
2.  **Update `blueprint.md`**: I will update this blueprint to document the change.
