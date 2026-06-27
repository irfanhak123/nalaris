/**
 * stores/userStore.ts — single-user state.
 *
 * Project Rumah has one user (the owner). There is no user picker, no
 * switching, no "add user". The gateway auto-creates the single user on
 * first launch; this store just mirrors it.
 *
 * The user's `preferences.alignment` holds what the agent learned during
 * alignment (goals, habits, current situation) — set by the gateway when
 * the agent emits an alignment-profile fence.
 *
 * Boot: fetchMe() -> GET /api/me.
 */

import { create } from 'zustand';
import { gateway, type GatewayUser } from '../lib/gateway';

interface UserStoreState {
  /** The single user. */
  me: GatewayUser | null;
  /** Whether /api/me has been fetched. */
  loaded: boolean;
  loading: boolean;
  error: string | null;

  /** Fetch the single user from the gateway. */
  fetchMe: () => Promise<GatewayUser | null>;
  /** Refresh the single user (e.g. after alignment updates it). */
  refreshMe: () => Promise<void>;
  /** Update the single user's fields. */
  updateMe: (fields: Partial<Pick<GatewayUser, 'name' | 'avatar_color' | 'avatar_emoji' | 'onboarded' | 'preferences'>>) => Promise<GatewayUser>;
  /** Mark the single user as onboarded. */
  markOnboarded: () => Promise<void>;
  clearError: () => void;
}

export const useUserStore = create<UserStoreState>((set, get) => ({
  me: null,
  loaded: false,
  loading: false,
  error: null,

  fetchMe: async () => {
    set({ loading: true, error: null });
    try {
      const { user } = await gateway.getMe();
      set({ me: user, loaded: true, loading: false });
      return user;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loaded: true, loading: false });
      return null;
    }
  },

  refreshMe: async () => {
    try {
      const { user } = await gateway.getMe();
      set({ me: user });
    } catch {
      // non-fatal
    }
  },

  updateMe: async (fields) => {
    const cur = get().me;
    if (!cur) throw new Error('no user');
    const { user } = await gateway.updateUser(cur.user_id, fields);
    set({ me: user });
    return user;
  },

  markOnboarded: async () => {
    const cur = get().me;
    if (!cur) return;
    try {
      const { user } = await gateway.markOnboarded(cur.user_id);
      set({ me: { ...user, onboarded: true } });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));