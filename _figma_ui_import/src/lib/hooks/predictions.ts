import { predictionsApi } from "../api/predictions";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function usePredictions() {
  return useEntityList("predictions", predictionsApi.list);
}

export function usePredictionsById(id: string | undefined) {
  return useEntityById("predictions", id, predictionsApi.getById);
}

export function usePredictionsMutations() {
  return useEntityMutations("predictions", {
    create: predictionsApi.create,
    update: predictionsApi.update,
    remove: predictionsApi.remove,
  });
}
