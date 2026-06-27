/**
 * stores/userStore.ts — multi-user state management.
 *
 * Manages the list of users, the active user, and onboarding status.
 * Persists the active user_id to localStorage so it survives reloads.
 *
 * Boot flow:
 *   1. Hydrate from localStorage (activeUserId)
 *   2. Fetch users from gateway
 *   3. If no users exist: show "Create your profile" onboarding
 *   4. If users exist but no active user: show user picker
 *   5. If active user exists: load their sessions
 *   6. If active user needs onboarding: show onboarding flow
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { gateway, type GatewayUser } from '../lib/gateway';

interface UserStoreState {
  /** All users from the gateway. */
  users: GatewayUser[];
  /** The currently active user. */
  activeUser: GatewayUser | null;
  /** Whether users have been fetched from the gateway. */
  usersLoaded: boolean;
  /** Whether we're currently fetching/creating users. */
  loading: boolean;
  /** Last error from a user operation. */
  error: string | null;

  /** Fetch all users from the gateway. */
  fetchUsers: () => Promise<void>;
  /** Create a new user and set as active. */
  createUser: (name: string, avatarColor?: string, avatarEmoji?: string) => Promise<GatewayUser>;
  /** Set the active user. */
  setActiveUser: (user: GatewayUser | null) => void;
  /** Update user fields. */
  updateUser: (userId: string, fields: Partial<Pick<GatewayUser, 'name' | 'avatar_color' | 'avatar_emoji' | 'onboarded' | 'preferences'>>) => Promise<GatewayUser>;
  /** Mark user as onboarded. */
  markOnboarded: (userId: string) => Promise<void>;
  /** Delete a user. */
  deleteUser: (userId: string) => Promise<void>;
  /** Clear error. */
  clearError: () => void;
}

const STORAGE_KEY = 'panel-v2-user';

export const useUserStore = create<UserStoreState>()(
  persist(
    (set, get) => ({
      users: [],
      activeUser: null,
      usersLoaded: false,
      loading: false,
      error: null,

      fetchUsers: async () => {
        set({ loading: true, error: null });
        try {
          const { users } = await gateway.listUsers();
          set({ users, usersLoaded: true, loading: false });

          // If we have an active user_id from localStorage, find the full user object
          const { activeUser } = get();
          if (activeUser) {
            const found = users.find(u => u.user_id === activeUser.user_id);
            if (found) {
              set({ activeUser: found });
            } else {
              // User was deleted, clear active
              set({ activeUser: null });
            }
          }
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e), loading: false, usersLoaded: true });
        }
      },

      createUser: async (name, avatarColor, avatarEmoji) => {
        set({ loading: true, error: null });
        try {
          const { user } = await gateway.createUser({
            name,
            avatar_color: avatarColor,
            avatar_emoji: avatarEmoji,
          });
          const { users } = get();
          set({
            users: [...users, user],
            activeUser: user,
            loading: false,
          });
          return user;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e), loading: false });
          throw e;
        }
      },

      setActiveUser: (user) => {
        set({ activeUser: user });
      },

      updateUser: async (userId, fields) => {
        try {
          const { user } = await gateway.updateUser(userId, fields);
          const { users, activeUser } = get();
          set({
            users: users.map(u => u.user_id === userId ? user : u),
            activeUser: activeUser?.user_id === userId ? user : activeUser,
          });
          return user;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      },

      markOnboarded: async (userId) => {
        try {
          await gateway.markOnboarded(userId);
          const { users, activeUser } = get();
          const updated = { ...activeUser!, onboarded: true };
          set({
            users: users.map(u => u.user_id === userId ? updated : u),
            activeUser: activeUser?.user_id === userId ? updated : activeUser,
          });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      deleteUser: async (userId) => {
        try {
          await gateway.deleteUser(userId);
          const { users, activeUser } = get();
          set({
            users: users.filter(u => u.user_id !== userId),
            activeUser: activeUser?.user_id === userId ? null : activeUser,
          });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        activeUser: s.activeUser,
      }),
    },
  ),
);
