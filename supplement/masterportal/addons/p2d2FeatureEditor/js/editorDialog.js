// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Modaler Info-Dialog des Add-ons p2d2FeatureEditor
//
// Ersetzt das Info-Popup und das alert des Standalone
// (src/utils/feature-popup-handler.ts: showInfoPopup, openFeatureEditor).
// Inhalte werden ausschließlich mit createElement und textContent gesetzt.

const DIALOG_ID = "p2d2-feature-editor-dialog";

// Grund aus clickFlow → Textschlüssel der Konfiguration (info.texts).
const REASON_TEXT = {
    "no-children": "noChildren",
    "check-failed": "checkFailed",
    "check-timeout": "checkTimeout",
    "popup-blocked": "popupBlocked"
};

// Gründe, bei denen der Editor trotzdem geöffnet werden kann.
const OPENABLE = new Set(["check-timeout", "popup-blocked"]);

/**
 * Erzeugt ein Element mit Text.
 * @param {Document} doc Dokument.
 * @param {string} tag Tag-Name.
 * @param {string} [text] Textinhalt.
 * @returns {HTMLElement} Element.
 */
function el (doc, tag, text) {
    const node = doc.createElement(tag);

    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

/**
 * Zeigt den modalen Info-Dialog. Ein vorhandener Dialog wird ersetzt.
 * Klick außerhalb des Inhalts (auf den Hintergrund) und Escape schließen ihn.
 * @param {Object} args Eingaben.
 * @param {Document} args.doc Dokument.
 * @param {Object} args.props Properties des Features.
 * @param {Object} args.layerConfig Geprüfte Layer-Konfiguration.
 * @param {{reason: string, editorUrl: (string|null), windowName?: string, windowFeatures?: string}} args.result Ergebnis aus clickFlow.
 * @param {function(string, string, string): (Object|null)} args.openWindow window.open-Ersatz.
 * @returns {HTMLDialogElement} Der geöffnete Dialog.
 */
export function showInfoDialog ({doc, props, layerConfig, result, openWindow}) {
    const {fields, texts} = layerConfig.info,
        dialog = el(doc, "dialog"),
        body = el(doc, "div"),
        list = el(doc, "dl"),
        actions = el(doc, "div"),
        closeButton = el(doc, "button", texts.close);

    doc.getElementById(DIALOG_ID)?.remove();
    dialog.id = DIALOG_ID;
    Object.assign(dialog.style, {padding: "0", border: "1px solid #ccc", borderRadius: "6px", maxWidth: "min(28rem, 90vw)"});
    Object.assign(body.style, {padding: "1rem 1.25rem"});
    Object.assign(list.style, {display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem 0.75rem", margin: "0.75rem 0"});
    Object.assign(actions.style, {display: "flex", gap: "0.5rem", justifyContent: "flex-end"});

    body.appendChild(el(doc, "h3", String(props?.name ?? "")));
    for (const {key, label} of fields) {
        const value = props?.[key];

        list.appendChild(el(doc, "dt", label));
        list.appendChild(el(doc, "dd", value === null || value === undefined || value === "" ? "–" : String(value)));
    }
    body.appendChild(list);
    body.appendChild(el(doc, "p", texts[REASON_TEXT[result.reason]] ?? texts.checkFailed));

    if (OPENABLE.has(result.reason) && result.editorUrl) {
        const openButton = el(doc, "button", texts.openEditor);

        openButton.type = "button";
        openButton.className = "btn btn-primary";
        openButton.addEventListener("click", () => {
            if (openWindow(result.editorUrl, result.windowName, result.windowFeatures)) {
                dialog.close();
            }
        });
        actions.appendChild(openButton);
    }
    closeButton.type = "button";
    closeButton.className = "btn btn-secondary";
    closeButton.addEventListener("click", () => dialog.close());
    actions.appendChild(closeButton);
    body.appendChild(actions);
    dialog.appendChild(body);

    // Ein Klick auf den Hintergrund trifft das dialog-Element selbst (padding 0).
    dialog.addEventListener("click", event => {
        if (event.target === dialog) {
            dialog.close();
        }
    });
    dialog.addEventListener("close", () => dialog.remove());

    doc.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
}
