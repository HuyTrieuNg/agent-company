import { useQuery } from "@tanstack/react-query";
import {
  getStockOverview,
  getStockFinancials,
  getStockTechnicals,
  getStockNews,
  getStockTrading,
} from "@/lib/stockApi";

export const stockKeys = {
  all: ["stocks"] as const,
  overview: (symbol: string) => [...stockKeys.all, "overview", symbol] as const,
  financials: (symbol: string, reportType?: string, period?: string) =>
    [...stockKeys.all, "financials", symbol, reportType, period] as const,
  technicals: (symbol: string, timeframe?: string) =>
    [...stockKeys.all, "technicals", symbol, timeframe] as const,
  news: (symbol: string) => [...stockKeys.all, "news", symbol] as const,
  trading: (symbol: string, startDate?: string, interval?: string) =>
    [...stockKeys.all, "trading", symbol, startDate, interval] as const,
};

export function useStockOverview(symbol: string) {
  return useQuery({
    queryKey: stockKeys.overview(symbol),
    queryFn: () => getStockOverview(symbol),
    enabled: Boolean(symbol),
    staleTime: 1000 * 60 * 2,
  });
}

export function useStockFinancials(symbol: string, reportType = "income_statement", period = "quarter") {
  return useQuery({
    queryKey: stockKeys.financials(symbol, reportType, period),
    queryFn: () => getStockFinancials(symbol, reportType, period),
    enabled: Boolean(symbol),
    staleTime: 1000 * 60 * 5,
  });
}

export function useStockTechnicals(symbol: string, timeframe = "1Y") {
  return useQuery({
    queryKey: stockKeys.technicals(symbol, timeframe),
    queryFn: () => getStockTechnicals(symbol, timeframe),
    enabled: Boolean(symbol),
    staleTime: 1000 * 60 * 2,
  });
}

export function useStockNews(symbol: string) {
  return useQuery({
    queryKey: stockKeys.news(symbol),
    queryFn: () => getStockNews(symbol),
    enabled: Boolean(symbol),
    staleTime: 1000 * 60 * 3,
  });
}

export function useStockTrading(symbol: string, startDate = "2024-01-01", interval = "1D") {
  return useQuery({
    queryKey: stockKeys.trading(symbol, startDate, interval),
    queryFn: () => getStockTrading(symbol, startDate, interval),
    enabled: Boolean(symbol),
    staleTime: 1000 * 30,
  });
}
