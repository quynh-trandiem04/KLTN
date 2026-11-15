import { create } from 'zustand';
import api from '@/lib/axios';

export const useWishlistStore = create((set, get) => ({
  items: [],
  count: 0,
  loading: false,
  favorited: {}, // {productId: boolean}

  // Lấy wishlist từ server
  fetchWishlist: async () => {
    try {
      set({ loading: true });
      const res = await api.get('/v1/wishlist');
      const items = res.data.items || [];
      const favorited = {};
      items.forEach(item => {
        favorited[item.product_id] = true;
      });
      set({ items, count: items.length, favorited });
    } catch (e) {
      if (e.response?.status === 401) set({ items: [], count: 0, favorited: {} });
    } finally {
      set({ loading: false });
    }
  },

  // Lấy số lượng wishlist
  fetchCount: async () => {
    try {
      const res = await api.get('/v1/wishlist/count');
      set({ count: res.data.count });
    } catch (e) {
      if (e.response?.status === 401) set({ count: 0 });
    }
  },

  // Check nếu product đã được favorite
  checkFavorited: async (productId) => {
    try {
      const res = await api.get(`/v1/wishlist/check/${productId}`);
      set(state => ({
        favorited: {
          ...state.favorited,
          [productId]: res.data.is_favorited
        }
      }));
      return res.data.is_favorited;
    } catch (e) {
      console.error('checkFavorited error:', e);
      return false;
    }
  },

  // Toggle wishlist (add/remove)
  toggleWishlist: async (productId, variantId = null) => {
    try {
      set({ loading: true });
      const res = await api.post(`/v1/wishlist/toggle/${productId}`, { variant_id: variantId });

      // Update favorited state
      set(state => ({
        favorited: {
          ...state.favorited,
          [productId]: res.data.is_favorited
        },
        count: res.data.is_favorited ? state.count + 1 : Math.max(0, state.count - 1)
      }));

      return res.data;
    } catch (e) {
      console.error('toggleWishlist error:', e);
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  // Thêm vào wishlist
  addToWishlist: async (productId, variantId = null, notes = null) => {
    try {
      const res = await api.post('/v1/wishlist', {
        product_id: productId,
        variant_id: variantId,
        notes
      });

      set(state => ({
        favorited: {
          ...state.favorited,
          [productId]: true
        },
        count: state.count + 1
      }));

      return res.data;
    } catch (e) {
      console.error('addToWishlist error:', e);
      throw e;
    }
  },

  // Xóa khỏi wishlist (by product)
  removeFromWishlist: async (productId) => {
    try {
      await api.delete(`/v1/wishlist/product/${productId}`);

      set(state => ({
        favorited: {
          ...state.favorited,
          [productId]: false
        },
        count: Math.max(0, state.count - 1)
      }));
    } catch (e) {
      console.error('removeFromWishlist error:', e);
      throw e;
    }
  },

  // Reset
  clearLocal: () => set({ items: [], count: 0, favorited: {} }),

  // Check xem product có được favorite hay không
  isFavorited: (productId) => get().favorited[productId] || false,
}));
