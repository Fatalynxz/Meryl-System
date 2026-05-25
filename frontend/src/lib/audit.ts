import { supabase } from "./supabase";

type AuditPayload = {
  actorUserId?: string | null;
  actionType: string;
  entityType: string;
  entityId?: string | null;
  oldData?: any;
  newData?: any;
  metadata?: any;
};

export async function writeAuditLog(payload: AuditPayload) {
  try {
    const { error } = await supabase.rpc("write_audit_log", {
      p_actor_user_id: payload.actorUserId ?? null,
      p_action_type: payload.actionType,
      p_entity_type: payload.entityType,
      p_entity_id: payload.entityId ?? null,
      p_old_data: payload.oldData ?? null,
      p_new_data: payload.newData ?? null,
      p_metadata: payload.metadata ?? null,
    } as any);
    if (error) return;
  } catch {
    // Keep business flow non-blocking if audit RPC is not yet deployed.
  }
}

