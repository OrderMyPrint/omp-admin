import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { api, ApiError, setCsrfToken, type Me } from "./api";

type Session = {
  me: Me | null;
  loading: boolean;
  can: (...permissions: string[]) => boolean;
  refresh: () => Promise<unknown>;
};

const SessionContext = createContext<Session>({
  me: null,
  loading: true,
  can: () => false,
  refresh: async () => undefined,
});

/** The signed-in staff member. The API enforces every permission; the UI only mirrors it. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const me = await api<Me>("/admin/auth/me");
        setCsrfToken(me.csrfToken);
        return me;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const me = query.data && !query.data.secondFactorPending ? query.data : null;
  const value: Session = {
    me,
    loading: query.isLoading,
    can: (...permissions) => Boolean(me && permissions.every((p) => me.permissions.includes(p))),
    refresh: () => client.invalidateQueries({ queryKey: ["me"] }),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
