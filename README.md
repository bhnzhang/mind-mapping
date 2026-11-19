# Open Map

A small, local mind mapping app. Create oval ideas, edit and resize them, drag them around, and connect them with lines. Nearby ovals move aside when one overlaps them. Maps save automatically in this browser and can be exported as JSON files.

## Open it

Open `index.html` in a browser. No installation or account is needed.

## Use it

- **Add an oval:** Double-click empty canvas space.
- **Edit text:** Double-click an oval, type, and press Enter. Press Esc to cancel.
- **Move an oval:** Drag it. Connected lines follow it.
- **Pan the map:** Drag empty canvas space.
- **Zoom:** Scroll the mouse wheel over the canvas. Zoom centers on the pointer; the current level appears in the footer. Labels grow within their ovals as you zoom out so they remain easier to read.
- **Connect ovals:** Drag from anywhere on an oval's outline to another oval. A click on the outline still selects or colors the oval.
- **Delete a connection:** Click its line, then press Delete/Backspace or click **Delete link** in the footer.
- **Resize an oval:** Select it and drag any of the four corner squares.
- **Color groups:** Pick a rainbow color in the sidebar, then click anywhere inside ovals to toggle that color. An oval can belong to several groups. **Erase colors** removes the colors from ovals you click. **Clear all colors** removes every oval's colors on the current map in one undoable step.
- **Undo or redo:** Use the toolbar buttons, Ctrl+Z/Ctrl+Shift+Z, or Ctrl+Y.
- **Delete an oval:** Select it and press Delete/Backspace.
- **Multiple maps:** Create and switch maps in the sidebar. Rename the active map with **Rename map**, or double-click its name in the list.
- **Save or open a file:** Use **Save file** to download the current map as `.openmap.json`. **Open file** imports a saved map as a new map in your sidebar.

The default oval style is gray with a black outline. Color groups are optional.

## GitHub Pages

This is a static site: `index.html` loads the local `styles.css` and `script.js` files without a build step. After pushing to a public GitHub repository, enable Pages with **Deploy from a branch**, select `main`, and choose **/ (root)**. The site will be available at `https://<owner>.github.io/<repository>/`.

Maps are stored in the browser's `localStorage` for the site's address. They persist across reloads in that browser, but they do not sync across devices or automatically transfer from the local `file://` version. Use **Save file** on the local version and **Open file** on the hosted version to move a map. Keep JSON exports as backups in case browser storage is cleared.
