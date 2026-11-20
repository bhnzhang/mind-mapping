# Open Map

A small, local mind mapping app. Create oval ideas, edit and resize them, drag them around, and connect them with lines. Nearby ovals move aside when one overlaps them. Maps save automatically in this browser and can be exported as JSON files.

## Open it

Open `index.html` in a browser. No installation or account is needed.

On first use, the starting map has “My ideas” in the center with five connected “Idea” ovals. Existing saved maps load as before, and **New map** starts with a single oval.

## Use it

- **Add an oval:** Double-click empty canvas space.
- **Edit text:** Double-click an oval, type, and press Enter. Press Esc to cancel.
- **Move an oval:** Drag it. Connected lines follow it.
- **Pan the map:** Drag empty canvas space in any direction; panning has no edge limit.
- **Select several ovals:** Hold Shift and drag a box around them. Shift-click an oval to add or remove it from the selection. Drag one selected oval to move the group, drag a corner square to resize every selected oval, or press Delete to remove the group.
- **Highlight connections:** Select one bubble and use the nearby menu to highlight bubbles up to 0–10 links away. The default 0 highlights only the selected bubble.
- **Zoom:** Scroll the mouse wheel over the canvas. Zoom centers on the pointer; the current level appears in the footer. Labels grow within their ovals as you zoom out so they remain easier to read.
- **Fit all:** Click the ⛶ button beside Undo and Redo to center every oval and fit the map on screen.
- **Dark mode:** Click the moon/sun button in the toolbar to switch themes. The choice is remembered in this browser.
- **Connect ovals:** Drag from anywhere on an oval's outline to another oval. A click on the outline still selects or colors the oval.
- **Crossing connections:** A connection that crosses an unrelated oval appears above the ovals as a dashed line. Other connections stay solid beneath them.
- **Delete a connection:** Click its line, then press Delete/Backspace or click **Delete link** in the footer.
- **Resize an oval:** Select it and drag any of the four corner squares. The squares grow as you zoom out, with a larger grab area. There is no maximum oval size.
- **Search bubbles:** Type in the sidebar search field to highlight bubbles whose text contains your search, regardless of letter case. Other bubbles fade; clear the field to show them normally.
- **Color groups:** Pick a rainbow color in the sidebar, then click anywhere inside ovals to toggle that color. An oval can belong to several groups. **Erase colors** removes the colors from ovals you click. **Clear all colors** removes every oval's colors on the current map in one undoable step.
- **Undo or redo:** Use the toolbar buttons, Ctrl+Z/Ctrl+Shift+Z, or Ctrl+Y.
- **Delete an oval:** Select it and press Delete/Backspace.
- **Multiple maps:** Create and switch maps in the sidebar. **Duplicate map** makes an independent copy of the active map and opens it. Rename a map with **Rename map**, or double-click its name in the list. **Delete current map** removes it after confirmation; deleting the last map creates a fresh blank map.
- **Save or open a file:** Use **Save file** to download the current map as `.openmap.json`. **Open file** imports a saved map as a new map in your sidebar.

The default oval style is gray with a black outline. Color groups are optional.

## GitHub Pages

This is a static site: `index.html` loads the local `styles.css` and `script.js` files without a build step. After pushing to a public GitHub repository, enable Pages with **Deploy from a branch**, select `main`, and choose **/ (root)**. The site will be available at `https://<owner>.github.io/<repository>/`.

Maps are stored in the browser's `localStorage` for the site's address. They persist across reloads in that browser, but they do not sync across devices or automatically transfer from the local `file://` version. Use **Save file** on the local version and **Open file** on the hosted version to move a map. Keep JSON exports as backups in case browser storage is cleared.
