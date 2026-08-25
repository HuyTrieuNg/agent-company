import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchSessions, fetchSessionDetail, deleteSession, ChatSessionSummary } from "@/lib/api";

export const chatKeys = {
  all: ["chat"] as const,
  sessions: () => [...chatKeys.all, "sessions"] as const,
  detail: (id: string | null) => [...chatKeys.all, "detail", id] as const,
};

export function useChatSessions() {
  return useQuery<ChatSessionSummary[]>({
    queryKey: chatKeys.sessions(),
    queryFn: fetchSessions,
    staleTime: 1000 * 30,
  });
}

export function useChatSessionDetail(sessionId: string | null) {
  return useQuery({
    queryKey: chatKeys.detail(sessionId),
    queryFn: () => (sessionId ? fetchSessionDetail(sessionId) : null),
    enabled: Boolean(sessionId),
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.sessions() });
    },
  });
}
