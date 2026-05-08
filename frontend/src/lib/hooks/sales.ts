import { salesApi } from "../api/sales";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useSales() {
  return useEntityList("sales", salesApi.list);
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
