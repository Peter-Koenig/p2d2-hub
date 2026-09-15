// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Astro-Content-Collection-Definitionen (Kategorien, Kommunen, Intern, Legal)
import { defineCollection, z } from "astro:content";
import { kommuneSchema, kategorieSchema } from "@p2d2/core";

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
  schema: kategorieSchema,
});

const kommunen = defineCollection({
  schema: kommuneSchema,
});

export const collections = {
  socialmedia,
  intern,
  resources,
  repositories,
  copyright,
  kategorien,
  werte,
  kommunen,
};
