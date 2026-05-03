import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useEntityList<T>(key: string, listFn: () => Promise<T[]>) {
  return useQuery({ queryKey: [key], queryFn: listFn, staleTime: 30_000 });
}

export function useEntityById<T>(key: string, id: string | undefined, getFn: (id: string) => Promise<T>) {
  return useQuery({
    queryKey: [key, id],
    queryFn: () => getFn(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useEntityMutations<T, C = any, U = any>(key: string, api: {
  create: (payload: C) => Promise<T>;
  update: (id: string, payload: U) => Promise<T>;
  remove: (id: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: api.create,
    onMutate: async (payload: C) => {
      await queryClient.cancelQueries({ queryKey: [key] });
      const previous = queryClient.getQueryData<T[]>([key]) ?? [];
      queryClient.setQueryData<T[]>([key], [...previous, payload as unknown as T]);
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) queryClient.setQueryData([key], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: U }) => api.update(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: [key] });
      const previous = queryClient.getQueryData<any[]>([key]) ?? [];
      queryClient.setQueryData<any[]>(
        [key],
        previous.map((row) => ((row?.id === id || row?.user_id === id || row?.product_id === id || row?.customer_id === id || row?.sales_id === id || row?.return_id === id || row?.promo_id === id || row?.prediction_id === id) ? { ...row, ...payload } : row)),
      );
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) queryClient.setQueryData([key], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: api.remove,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: [key] });
      const previous = queryClient.getQueryData<any[]>([key]) ?? [];
      queryClient.setQueryData<any[]>(
        [key],
        previous.filter((row) => {
          const values = Object.values(row ?? {});
          return !values.includes(id);
        }),
      );
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) queryClient.setQueryData([key], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  return { createMutation, updateMutation, removeMutation };
}
