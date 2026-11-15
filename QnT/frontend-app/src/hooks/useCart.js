// frontend-app\src\hooks\useCart.js

'use client';

import { useState } from 'react';

export function useCart() {
  const [items, setItems] = useState([]);

  const addItem = (product) => {
    setItems([...items, product]);
  };

  const removeItem = (productId) => {
    setItems(items.filter(item => item.id !== productId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = items.reduce((sum, item) => sum + item.price, 0);

  return { items, addItem, removeItem, clearCart, total };
}
