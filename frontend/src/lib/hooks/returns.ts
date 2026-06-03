import { returnsApi } from "../api/returns";
import { useEntityById, useEntityMutations } from "./_common";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth-context";

export function useReturns() {
  const { user } = useAuth();
  const normalizedRole = String(user?.role_name ?? "").trim().toLowerCase();
  const isAdmin = normalizedRole.includes("admin");
  const userId = String(user?.user_id ?? "");

  return useQuery({
    queryKey: ["returns", isAdmin ? "all" : "mine", userId],
    queryFn: () => (isAdmin ? returnsApi.list() : returnsApi.listByUser(userId)),
    enabled: isAdmin || Boolean(userId),
    staleTime: 30_000,
  });
}

export function useReturnsById(id: string | undefined) {
  return useEntityById("returns", id, returnsApi.getById);
}

export function useReturnsMutations() {
  return useEntityMutations("returns", {
    create: returnsApi.create,
    update: returnsApi.update,
    remove: returnsApi.remove,
  });
}
