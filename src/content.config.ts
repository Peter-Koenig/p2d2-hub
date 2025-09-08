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
  }),
});

const kommunen = defineCollection({
  schema: z.object({
    title: z.string(),
    colorStripe: z.string().default("#FF6900"),
    icon: z.string().optional(),
    order: z.number().optional(),
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
