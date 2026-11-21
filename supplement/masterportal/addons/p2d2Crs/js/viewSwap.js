// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Austausch der 2D-View des Masterportals bei Projektionswechsel
//
// Das Masterportal 3.27.1 hat keine API zum Projektionswechsel zur Laufzeit.
// swapView ersetzt die View (map.setView) und verbindet danach die Teile neu,
// die an der alten View oder ihrer Projektion hängen. Die Liste mit Fundstellen
// steht im README (Abschnitt „Projektions-Switch“).
// Karte, View-Klasse, Store und Registrierung werden injiziert; ol/proj und
// ol/functions sind die einzigen festen Importe.

import {getPointResolution, transform, transformExtent} from "ol/proj.js";
import {VOID} from "ol/functions.js";

/**
 * Ziel des Umschalters.
 * @param {{activeCrs: string, localCrs: (string|undefined), genericCrs: string}} state Zustand.
 * @returns {string|null} Zielprojektion oder null, wenn kein lokales CRS bekannt ist.
 */
export function targetCrs ({activeCrs, localCrs, genericCrs}) {
    if (typeof localCrs !== "string" || localCrs === "") {
        return null;
    }
    return activeCrs === localCrs ? genericCrs : localCrs;
}

/**
 * Auflösung in der Zielprojektion mit gleicher Bodenauflösung am Zentrum.
 * @param {Object} args Eingaben.
 * @param {number} args.resolution Auflösung in der Ausgangsprojektion.
 * @param {number[]} args.center Zentrum in der Ausgangsprojektion.
 * @param {string} args.from Ausgangsprojektion.
 * @param {string} args.to Zielprojektion.
 * @returns {number} Auflösung in der Zielprojektion (nicht eingerastet).
 */
export function targetResolution ({resolution, center, from, to}) {
    const ground = getPointResolution(from, resolution, center),
        centerTo = transform(center, from, to);

    return ground / getPointResolution(to, 1, centerTo);
}

/**
 * Rastet eine Auflösung auf die nächste Stufe der Portal-Tabelle ein.
 * Gleiche Regel wie OpenLayers bei constrainResolution (linear nächster Wert,
 * bei Gleichstand die feinere Stufe); außerhalb der Tabelle die Randstufe.
 * @param {number} resolution Auflösung.
 * @param {number[]} resolutions Absteigend sortierte Auflösungen.
 * @returns {number} Eine Auflösung aus resolutions.
 */
export function snapResolution (resolution, resolutions) {
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
        throw new TypeError("snapResolution: resolutions fehlt");
    }
    if (!Number.isFinite(resolution) || resolution <= 0) {
        throw new TypeError(`snapResolution: ungültige Auflösung ${resolution}`);
    }
    if (resolution >= resolutions[0]) {
        return resolutions[0];
    }
    for (let i = 1; i < resolutions.length; i++) {
        if (resolution >= resolutions[i]) {
            return resolutions[i - 1] - resolution < resolution - resolutions[i] ? resolutions[i - 1] : resolutions[i];
        }
    }
    return resolutions[resolutions.length - 1];
}

/**
 * View-Optionen wie masterportalapi createMapView (src/maps/mapView.js):
 * options wird zur View-Property (Maßstab im Store, Scale-Switcher),
 * Einrasten auf die Tabelle, Extent begrenzt nur das Zentrum.
 * @param {Object} args Eingaben.
 * @param {string} args.projection Zielprojektion.
 * @param {number[]} args.center Zentrum in der Zielprojektion.
 * @param {number} args.resolution Eingerastete Auflösung.
 * @param {number} args.rotation Rotation.
 * @param {Object[]} args.options Portal-Tabelle (resolution, scale, zoomLevel).
 * @param {number[]} args.resolutions Auflösungen der Tabelle.
 * @param {string} [args.backgroundImage] Hintergrundbild der View.
 * @param {{extent: number[], epsg: string}} [args.baseExtent] Extent der Portal-Konfiguration.
 * @returns {Record<string, any>} Optionen für new View().
 */
export function buildViewOptions ({projection, center, resolution, rotation, options, resolutions, backgroundImage, baseExtent}) {
    const extent = Array.isArray(baseExtent?.extent) && baseExtent.epsg
        ? transformExtent(baseExtent.extent, baseExtent.epsg, projection)
        : undefined;

    return {
        projection,
        center,
        resolution,
        rotation,
        extent,
        options,
        resolutions,
        constrainResolution: true,
        constrainOnlyCenter: true,
        backgroundImage
    };
}

/**
 * Vektorquelle mit URL oder eigenem Loader (GeoJSON, WFS, OAF …).
 * loader_ ist ein internes Feld von ol/source/Vector; ohne URL und Loader
 * ist es VOID (ol/functions.js).
 * @param {Object} source Vektorquelle.
 * @returns {boolean} true, wenn die Quelle neu geladen werden kann.
 */
export function isRemoteSource (source) {
    return Boolean(source.getUrl?.()) || (typeof source.loader_ === "function" && source.loader_ !== VOID);
}

/**
 * Bringt Vektordaten in die neue Projektion. Geladene Features werden von OL
 * nicht umprojiziert: Quellen mit URL/Loader laden neu (der Loader bekommt die
 * neue View-Projektion), Quellen ohne (Zeichnen, Messen, Inline-Features)
 * werden transformiert. Cluster-Quellen werden über ihre innere Quelle behandelt.
 * @param {Object[]} layers OL-Layer (map.getAllLayers()).
 * @param {string} from Alte Projektion.
 * @param {string} to Neue Projektion.
 * @returns {{refreshed: number, transformed: number}} Anzahl behandelter Quellen.
 */
export function reprojectLayers (layers, from, to) {
    const seen = new Set();
    let refreshed = 0,
        transformed = 0;

    for (const layer of layers) {
        let source = layer?.getSource?.();

        if (typeof source?.getSource === "function" && typeof source.getSource()?.getFeatures === "function") {
            source = source.getSource();
        }
        if (typeof source?.getFeatures !== "function" || seen.has(source)) {
            continue;
        }
        seen.add(source);
        if (isRemoteSource(source)) {
            source.refresh();
            refreshed++;
        }
        else {
            source.getFeatures().forEach(feature => feature.getGeometry()?.transform(from, to));
            transformed++;
        }
    }
    return {refreshed, transformed};
}

/**
 * Prüft über die View-Property extent (ol/View übernimmt Konstruktor-Optionen
 * als Properties), ob die View einen Extent hat.
 * @param {Object} view OL-View.
 * @returns {boolean} true, wenn ein Extent gesetzt ist.
 */
export function hasExtent (view) {
    return Array.isArray(view?.get?.("extent"));
}

/**
 * Tauscht die View der 2D-Karte gegen eine View in der Zielprojektion.
 * Schritte (README „Projektions-Switch“):
 *  0 nur 2D, nicht bei gleicher Projektion (Ausnahme dropExtent)
 *  1 Projektion sicherstellen
 *  2–5 neue View mit Portal-Tabelle, Austausch, Prüfung, sonst Rollback
 *  6 Store Maps und View-Listener neu verbinden
 *  7 Vektorquellen und Overlays
 *  8 Marker, Highlights, BackForward leeren
 * @param {Object} deps Abhängigkeiten.
 * @param {string} deps.target Zielprojektion.
 * @param {Object} deps.map OL-Karte (getView, setView, getAllLayers, getOverlays).
 * @param {Function} deps.View View-Klasse (ol/View.js).
 * @param {function(string): boolean} deps.ensureProjection Siehe utm.js createEnsureProjection.
 * @param {Object} deps.getters Root-Getter des Masterportal-Stores.
 * @param {function(string, *): void} deps.commit Root-Commit.
 * @param {function(string, *=): void} deps.dispatch Root-Dispatch.
 * @param {{extent: number[], epsg: string}} [deps.baseExtent] Extent der Portal-Konfiguration.
 * @param {boolean} [deps.dropExtent=false] Neue View ohne Extent. Bei gleicher
 *   Projektion wird die View nur ersetzt, wenn sie einen Extent hat; die
 *   Koordinaten bleiben gültig, Schritte 7 und 8 entfallen.
 * @returns {{ok: boolean, reason?: string, unchanged?: boolean, rebuilt?: boolean, from?: string, to?: string, error?: Error}} Ergebnis.
 */
export function swapView ({target, map, View, ensureProjection, getters, commit, dispatch, baseExtent, dropExtent = false}) {
    if (getters["Maps/mode"] !== "2D") {
        return {ok: false, reason: "mode"};
    }
    const oldView = map.getView(),
        from = oldView.getProjection().getCode(),
        rebuilt = from === target;

    if (rebuilt && !(dropExtent && hasExtent(oldView))) {
        return {ok: true, unchanged: true, from, to: target};
    }
    if (!ensureProjection(target)) {
        return {ok: false, reason: "projection"};
    }

    let newView;

    try {
        const center = oldView.getCenter(),
            resolutions = oldView.getResolutions(),
            resolution = snapResolution(
                rebuilt ? oldView.getResolution() : targetResolution({resolution: oldView.getResolution(), center, from, to: target}),
                resolutions
            );

        newView = new View(buildViewOptions({
            projection: target,
            center: transform(center, from, target),
            resolution,
            rotation: oldView.getRotation(),
            options: oldView.get("options"),
            resolutions,
            backgroundImage: oldView.get("backgroundImage"),
            baseExtent: dropExtent ? undefined : baseExtent
        }));
        map.setView(newView);
    }
    catch (error) {
        if (map.getView() !== oldView) {
            map.setView(oldView);
        }
        return {ok: false, reason: "error", error};
    }
    if (map.getView() !== newView || newView.getProjection().getCode() !== target) {
        map.setView(oldView);
        return {ok: false, reason: "verify"};
    }

    // 6 Store Maps: einmalig beim Start gesetzte Werte (actionsMapsAttributesMapper.js
    // setInitialAttributes) und der change:resolution-Listener der alten View.
    const initialCenter = getters["Maps/initialCenter"];

    commit("Maps/setProjection", newView.getProjection());
    commit("Maps/setResolutions", newView.getResolutions());
    commit("Maps/setScales", (newView.get("options") ?? []).map(option => option.scale));
    if (Array.isArray(initialCenter)) {
        commit("Maps/setInitialCenter", transform(initialCenter, from, target));
    }
    commit("Maps/setInitialZoom", getters["Maps/initialZoom"]);
    dispatch("Maps/registerMapViewListener");
    dispatch("Maps/updateAttributesByChangeResolution");
    dispatch("Maps/updateAttributesByMoveend");

    if (rebuilt) {
        return {ok: true, rebuilt: true, from, to: target};
    }

    // 7 Vektorquellen und Overlays (z. B. Mess-Tooltips).
    reprojectLayers(map.getAllLayers(), from, target);
    for (const overlay of map.getOverlays().getArray()) {
        const position = overlay.getPosition();

        if (Array.isArray(position)) {
            overlay.setPosition(transform(position, from, target));
        }
    }

    // 8 Koordinaten der alten Projektion verwerfen.
    dispatch("Maps/removePointMarker");
    dispatch("Maps/removePolygonMarker");
    dispatch("Maps/removeHighlightFeature");
    commit("Controls/BackForward/setMemory", []);
    commit("Controls/BackForward/setPosition", null);

    return {ok: true, from, to: target};
}
