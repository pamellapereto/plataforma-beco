import { usesPostgres } from '../config.js';
import { checkPostgresConnection, mirrorPostgresAuthUser, postgresRequest } from './postgres.js';
import { supabaseGateway, supabaseRequest } from './supabase.js';

export const dataRequest = usesPostgres() ? postgresRequest : supabaseRequest;

export async function checkDatabaseConnection() {
  if (usesPostgres()) {
    const result = await checkPostgresConnection();
    return { provider: 'postgres', database: result.database, user: result.user };
  }
  await supabaseRequest('rest/v1/organizations?select=id&limit=1');
  return { provider: 'supabase' };
}

export const persistenceGateway = Object.freeze({
  ...supabaseGateway,
  async signUpWithPassword(input) {
    const result = await supabaseGateway.signUpWithPassword(input);
    if (usesPostgres()) await mirrorPostgresAuthUser(result.user);
    return result;
  },
  async adminCreateAuthUser(input) {
    const result = await supabaseGateway.adminCreateAuthUser(input);
    if (usesPostgres()) await mirrorPostgresAuthUser(result.user || result);
    return result;
  },
  request(path, options) {
    return path.startsWith('rest/v1/') && usesPostgres()
      ? postgresRequest(path, options)
      : supabaseRequest(path, options);
  }
});
