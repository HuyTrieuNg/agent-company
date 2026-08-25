import { useQuery } from "@tanstack/react-query";
import {
  fetchNewsArticles,
  fetchNewsCategories,
  fetchFullArticles,
  FetchNewsParams,
} from "@/lib/api";

export const newsKeys = {
  all: ["news"] as const,
  lists: () => [...newsKeys.all, "list"] as const,
  list: (params: FetchNewsParams) => [...newsKeys.lists(), params] as const,
  categories: () => [...newsKeys.all, "categories"] as const,
  full: (hash: string) => [...newsKeys.all, "full", hash] as const,
};

export function useNewsArticles(params: FetchNewsParams) {
  return useQuery({
    queryKey: newsKeys.list(params),
    queryFn: () => fetchNewsArticles(params),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 3, // 3 minutes
  });
}

export function useNewsCategories() {
  return useQuery({
    queryKey: newsKeys.categories(),
    queryFn: fetchNewsCategories,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
}

export function useFullArticle(urlHash?: string) {
  return useQuery({
    queryKey: newsKeys.full(urlHash || ""),
    queryFn: async () => {
      if (!urlHash) return null;
      const res = await fetchFullArticles([urlHash]);
      return res.articles?.[0] || null;
    },
    enabled: Boolean(urlHash),
    staleTime: 1000 * 60 * 10,
  });
}
