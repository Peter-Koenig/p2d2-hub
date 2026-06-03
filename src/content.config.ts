// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Astro-Content-Collection-Definitionen (Kategorien, Kommunen, Intern, Legal)
import { defineCollection, z } from "astro:content";

const socialmedia = defineCollection({
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
    icon: z.string(),
  }),
});
const intern = defineCollection({
  schema: z.object({
    name: z.string(),
    url: z.string(),
  }),
});
const resources = defineCollection({
  schema: z.object({
    name: z.string(),
    url: z.string(),
  }),
});
const repositories = defineCollection({
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
  }),
});
const legal = defineCollection({
  schema: z.object({
    name: z.string(),
    url: z.string(),
  }),
});
const copyright = defineCollection({
  schema: z.object({
    text: z.string(),
  }),
});

const werte = defineCollection({
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    order: z.number(),
  }),
});

const kategorien = defineCollection({
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    order: z.number(),
    description: z.string(),
    containerType: z.string().optional(),
    image_version: z.string().default("001"),
  }),
});

const kommunen = defineCollection({
  schema: z.object({
    title: z.string(),
    colorStripe: z.string().default("#FF6900"),
    osmAdminLevels: z.array(z.number()).optional(),
    wp_name: z
      .string()
      .min(3, "Wikipedia identifier must be at least 3 characters")
      .regex(/^[a-z]{2,3}-/, "Must start with language code and hyphen")
      .refine((val: string) => {
        const parts = val.split("-", 2);
        return parts.length === 2 && parts[1].length > 0;
      }, "Must contain exactly one hyphen separating language code and article name"),
    osm_refinement: z.string().optional(),
    icon: z.string().optional(),
    order: z.number().optional(),
    image_version: z.string().default("001"),
    map: z.object({
      center: z.tuple([z.number(), z.number()]).optional(), // [lon, lat] WGS84
      zoom: z.number().optional(),
      extent: z
        .tuple([z.number(), z.number(), z.number(), z.number()])
        .optional(),
      projection: z.string().optional(),
      extra: z.record(z.any()).optional(),
    }),
  }),
});

export const collections = {
  socialmedia,
  intern,
  resources,
  repositories,
  legal,
  copyright,
  kategorien,
  werte,
  kommunen,
};
