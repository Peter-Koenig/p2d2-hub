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

export const collections = {
  socialmedia,
  intern,
  resources,
  repositories,
  legal,
  copyright,
};
