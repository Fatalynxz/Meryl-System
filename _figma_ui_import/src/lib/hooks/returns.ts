import { returnsApi } from "../api/returns";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useReturns() {
  return useEntityList("returns", returnsApi.list);
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
