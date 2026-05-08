import { promotionsApi } from "../api/promotions";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function usePromotions() {
  return useEntityList("promotions", promotionsApi.list);
}

export function usePromotionsById(id: string | undefined) {
  return useEntityById("promotions", id, promotionsApi.getById);
}

export function usePromotionsMutations() {
  return useEntityMutations("promotions", {
    create: promotionsApi.create,
    update: promotionsApi.update,
    remove: promotionsApi.remove,
  });
}
