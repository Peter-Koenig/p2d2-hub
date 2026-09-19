// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Re-Export des OIDC-Metadata-Parsers aus @p2d2/core.
export {
  parseMetadata,
  validateTopicKey,
  validateKommuneSlug,
  validateRegionKey,
} from "@p2d2/core";
export type {
  Membership,
  UserPreferences,
  ParsedMetadata,
} from "@p2d2/core";
