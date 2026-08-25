import { useQuery } from "@tanstack/react-query";
import { fetchForexOverview, fetchForexHistory, fetchForexNews } from "@/lib/forexApi";

export const forexKeys = {
  all: ["forex"] as const,
  overview: () => [...forexKeys.all, "overview"] as const,
  history: (pair: string, timeframe: string) => [...forexKeys.all, "history", pair, timeframe] as const,
  news: () => [...forexKeys.all, "news"] as const,
};

export function useForexOverview() {
  return useQuery({
    queryKey: forexKeys.overview(),
    queryFn: fetchForexOverview,
    staleTime: 1000 * 60 * 2,
  });
}

export function useForexHistory(pair: string = "USD", timeframe: string = "1M") {
  return useQuery({
    queryKey: forexKeys.history(pair, timeframe),
    queryFn: () => fetchForexHistory(pair, timeframe),
    enabled: Boolean(pair),
    staleTime: 1000 * 60 * 2,
  });
}

export function useForexNews() {
  return useQuery({
    queryKey: forexKeys.news(),
    queryFn: fetchForexNews,
    staleTime: 1000 * 60 * 5,
  });
}
