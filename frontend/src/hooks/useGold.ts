import { useQuery } from "@tanstack/react-query";
import { fetchGoldOverview, fetchGoldHistory, fetchGoldNews } from "@/lib/goldApi";

export const goldKeys = {
  all: ["gold"] as const,
  overview: () => [...goldKeys.all, "overview"] as const,
  history: (code: string, timeframe: string) => [...goldKeys.all, "history", code, timeframe] as const,
  news: () => [...goldKeys.all, "news"] as const,
};

export function useGoldOverview() {
  return useQuery({
    queryKey: goldKeys.overview(),
    queryFn: fetchGoldOverview,
    staleTime: 1000 * 60 * 2,
  });
}

export function useGoldHistory(code: string = "SJC", timeframe: string = "1M") {
  return useQuery({
    queryKey: goldKeys.history(code, timeframe),
    queryFn: () => fetchGoldHistory(code, timeframe),
    enabled: Boolean(code),
    staleTime: 1000 * 60 * 2,
  });
}

export function useGoldNews() {
  return useQuery({
    queryKey: goldKeys.news(),
    queryFn: fetchGoldNews,
    staleTime: 1000 * 60 * 5,
  });
}
