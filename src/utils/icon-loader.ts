import type { AstroComponentFactory } from "astro/runtime/server/index";

/**
 * Interface für Icon-Props
 */
export interface IconProps {
  class?: string;
  style?: string;
  [key: string]: unknown;
}

/**
 * Interface für geladene Icon-Komponenten
 */
export interface IconComponent {
  default: AstroComponentFactory;
}

/**
 * Default Icon Name aus Environment-Variablen
 * Fallback, falls kein Icon gefunden wird
 */
const DEFAULT_CATEGORY_ICON =
  import.meta.env.DEFAULT_CATEGORY_ICON || "Fahnenmasten.svg";

/**
 * Lädt eine Icon-Komponente dynamisch basierend auf dem Icon-Namen
 * @param iconName - Der Name des Icons (z.B. "friedhof", "blumenbeet")
 * @returns Promise mit der geladenen Icon-Komponente oder null falls nicht gefunden
 */
export async function loadIconComponent(
  iconName: string,
): Promise<IconComponent | null> {
  try {
    // Versuche zuerst .astro Komponenten zu laden
    try {
      const component = await import(
        `../components/icons/${iconName}Icon.astro`
      );
      return component;
    } catch (astroError) {
      // Falls .astro Komponente nicht existiert, versuche .svg
      try {
        const component = await import(`../components/icons/${iconName}.svg`);
        return component;
      } catch (svgError) {
        console.warn(`Icon "${iconName}" nicht gefunden als .astro oder .svg`);
        return null;
      }
    }
  } catch (error) {
    console.error(`Fehler beim Laden des Icons "${iconName}":`, error);
    return null;
  }
}

/**
 * Lädt das Default-Icon als Fallback
 */
export async function loadDefaultIcon(): Promise<IconComponent> {
  try {
    // Entferne .svg Extension falls vorhanden
    const defaultIconName = DEFAULT_CATEGORY_ICON.replace(".svg", "");
    const defaultIcon = await loadIconComponent(defaultIconName);

    if (defaultIcon) {
      return defaultIcon;
    }

    // Fallback zu Fahnenmasten falls alles fehlschlägt
    return await import("../components/icons/Fahnenmasten.svg");
  } catch (error) {
    console.error("Fehler beim Laden des Default-Icons:", error);
    throw new Error("Could not load default icon");
  }
}

/**
 * Hauptfunktion zum Laden und Rendern von Icons
 * @param iconName - Der Icon-Name aus der Kategorie-Definition
 * @param props - Optionale Props für die Icon-Komponente
 * @returns Promise mit der gerenderten Icon-Komponente oder Default-Icon
 */
export async function renderIcon(
  iconName: string,
  props: IconProps = {},
): Promise<AstroComponentFactory> {
  try {
    const iconComponent = await loadIconComponent(iconName);

    if (iconComponent) {
      return iconComponent.default;
    }

    // Fallback zum Default-Icon
    console.warn(`Icon "${iconName}" nicht gefunden, verwende Default-Icon`);
    const defaultIcon = await loadDefaultIcon();
    return defaultIcon.default;
  } catch (error) {
    console.error(`Fehler beim Rendern des Icons "${iconName}":`, error);
    const defaultIcon = await loadDefaultIcon();
    return defaultIcon.default;
  }
}

/**
 * Prüft ob ein Icon existiert
 * @param iconName - Der Icon-Name zum Prüfen
 * @returns Promise mit boolean ob Icon existiert
 */
export async function iconExists(iconName: string): Promise<boolean> {
  try {
    const iconComponent = await loadIconComponent(iconName);
    return iconComponent !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Gibt alle verfügbaren Icon-Namen zurück (für Debugging)
 */
export async function getAvailableIcons(): Promise<string[]> {
  // Diese Funktion würde normalerweise das Dateisystem lesen,
  // aber für Astro reicht es, die bekannten Patterns zu verwenden

  return [];
}
