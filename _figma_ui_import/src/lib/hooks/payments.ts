import { paymentsApi } from "../api/payments";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function usePayments() {
  return useEntityList("payments", paymentsApi.list);
}

export function usePaymentsById(id: string | undefined) {
  return useEntityById("payments", id, paymentsApi.getById);
}

export function usePaymentsMutations() {
  return useEntityMutations("payments", {
    create: paymentsApi.create,
    update: paymentsApi.update,
    remove: paymentsApi.remove,
  });
}
