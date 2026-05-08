import { analyticsApi } from "../api/analytics";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useAnalytics() {
  return useEntityList("analytics", analyticsApi.list);
}

export function useAnalyticsById(id: string | undefined) {
  return useEntityById("analytics", id, analyticsApi.getById);
}

export function useAnalyticsMutations() {
  return useEntityMutations("analytics", {
    create: analyticsApi.create,
    update: analyticsApi.update,
    remove: analyticsApi.remove,
  });
}
