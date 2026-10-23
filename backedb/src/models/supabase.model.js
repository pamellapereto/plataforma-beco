import { supabaseGateway } from '../lib/supabase.js';

// Camada Model: concentra a comunicacao persistente com Auth, PostgREST e Storage.
export class SupabaseModel {
  constructor(gateway = supabaseGateway) {
    this.gateway = gateway;
  }

  request(...args) { return this.gateway.request(...args); }
  signUpWithPassword(...args) { return this.gateway.signUpWithPassword(...args); }
  signInWithPassword(...args) { return this.gateway.signInWithPassword(...args); }
  refreshAuthSession(...args) { return this.gateway.refreshAuthSession(...args); }
  signOutAuthSession(...args) { return this.gateway.signOutAuthSession(...args); }
  requestPasswordRecovery(...args) { return this.gateway.requestPasswordRecovery(...args); }
  updateAuthPassword(...args) { return this.gateway.updateAuthPassword(...args); }
  adminCreateAuthUser(...args) { return this.gateway.adminCreateAuthUser(...args); }
  adminDeleteAuthUser(...args) { return this.gateway.adminDeleteAuthUser(...args); }
  authenticatedSupabaseUser(...args) { return this.gateway.authenticatedSupabaseUser(...args); }
  createSignedUploadUrl(...args) { return this.gateway.createSignedUploadUrl(...args); }
  createSignedReadUrl(...args) { return this.gateway.createSignedReadUrl(...args); }
  deleteStorageObjects(...args) { return this.gateway.deleteStorageObjects(...args); }
}

export const supabaseModel = new SupabaseModel();
