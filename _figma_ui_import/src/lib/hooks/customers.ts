import { customersApi } from "../api/customers";
import { useEntityById, useEntityList, useEntityMutations } from "./_common";

export function useCustomers() {
  return useEntityList("customers", customersApi.list);
}

export function useCustomersById(id: string | undefined) {
  return useEntityById("customers", id, customersApi.getById);
}

export function useCustomersMutations() {
  return useEntityMutations("customers", {
    create: customersApi.create,
    update: customersApi.update,
    remove: customersApi.remove,
  });
}
