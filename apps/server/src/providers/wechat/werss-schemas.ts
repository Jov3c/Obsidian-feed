import { z } from "zod";

const wrapper = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number().int(), message: z.string(), data }).passthrough();

const nullableUrl = z.string().url().nullable().optional();

export const byArticleResponseSchema = wrapper(
  z
    .object({
      mp_info: z
        .object({
          mp_name: z.string().min(1),
          logo: nullableUrl,
          biz: z.string().min(1),
        })
        .passthrough(),
      description: z.string().nullable().optional(),
    })
    .passthrough(),
);

export const addSourceResponseSchema = wrapper(
  z
    .object({
      id: z.string().min(1),
      mp_name: z.string().min(1),
      mp_cover: nullableUrl,
      faker_id: z.string().min(1),
    })
    .passthrough(),
);

export const articleSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    author: z.string().nullable().optional(),
    pic_url: nullableUrl,
    publish_time: z.union([z.number(), z.string()]).nullable().optional(),
    content: z.string().nullable().optional(),
  })
  .passthrough();

export const articleListResponseSchema = wrapper(
  z
    .object({
      list: z.array(articleSchema),
      total: z.number().int().nonnegative(),
    })
    .passthrough(),
);
