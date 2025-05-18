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
    description: z.string(),
  }),
});

const kategorien = defineCollection({
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    order: z.number(),
    description: z.string(),
  }),
});

export const collections = {
  socialmedia,
  intern,
  resources,
  repositories,
  legal,
  copyright,
};
