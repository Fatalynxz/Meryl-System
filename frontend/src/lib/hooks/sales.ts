import { salesApi } from "../api/sales";
import { useEntityById, useEntityMutations } from "./_common";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth-context";

export function useSales() {
  const { user } = useAuth();
  const normalizedRole = String(user?.role_name ?? "").trim().toLowerCase();
  const isAdmin = normalizedRole.includes("admin");
  const userId = String(user?.user_id ?? "");

  return useQuery({
    queryKey: ["sales", isAdmin ? "all" : "mine", userId],
    queryFn: () => (isAdmin ? salesApi.list() : salesApi.listByUser(userId)),
    enabled: isAdmin || Boolean(userId),
    staleTime: 30_000,
  });
}

export function useSalesById(id: string | undefined) {
  return useEntityById("sales", id, salesApi.getById);
}

export function useSalesMutations() {
  return useEntityMutations("sales", {
    create: salesApi.create,
    update: salesApi.update,
    remove: salesApi.remove,
  });
}
