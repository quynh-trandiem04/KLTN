import { create } from 'zustand';
import api from '@/lib/axios';

export const useCartStore = create((set, get) => ({
  items: [],
  count: 0,
  loading: false,

  // Lấy giỏ hàng từ server
  fetchCart: async () => {
    try {
      const res = await api.get('/v1/cart');
      const items = res.data.items || [];
      set({ items, count: items.reduce((s, i) => s + i.quantity, 0) });
    } catch (e) {
      if (e.response?.status === 401) set({ items: [], count: 0 });
    }
  },

  // Lấy số lượng
  fetchCount: async () => {
    try {
      const res = await api.get('/v1/cart/count');
      set({ count: res.data.count });
    } catch (e) {
      if (e.response?.status === 401) set({ count: 0 });
    }
  },

  // Thêm vào giỏ
  addToCart: async (product_id, variant_id, quantity = 1) => {
    const res = await api.post('/v1/cart', { product_id, variant_id, quantity });
    await get().fetchCart();
    return res.data;
  },

  // Cập nhật số lượng
  updateQuantity: async (id, quantity) => {
    await api.put(`/v1/cart/${id}`, { quantity });
    await get().fetchCart();
  },

  // Xóa item
  removeItem: async (id) => {
    await api.delete(`/v1/cart/${id}`);
    await get().fetchCart();
  },

  // Reset
  clearLocal: () => set({ items: [], count: 0 }),
}));
