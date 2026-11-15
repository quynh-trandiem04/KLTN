// frontend-app\src\store\useUserStore.js

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set) => ({
      user: null,
      roles: [],
      
      setUser: (user) => set({ user, roles: user?.roles || [] }),
      
      clearUser: () => set({ user: null, roles: [] }),
      
      hasRole: (role) => {
        const state = useUserStore.getState();
        return state.roles.includes(role);
      }
    }),
    {
      name: 'user-storage'
    }
  )
);
