// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: {
      id: string;
      name: string;
      displayName: string;
      email: string;
      roles: string[];
      isAnonymous: boolean;
      memberships?: import("./lib/auth/metadata-parser").Membership[];
      preferences?: import("./lib/auth/metadata-parser").UserPreferences;
    };
    isAuthenticated: boolean;
    idTokenClaims?: Record<string, unknown>;
  }
}
