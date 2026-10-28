import { useState, useCallback } from 'react';
import { StaffTable } from '../types/index.js';
import { request } from '../api/client.js';
import { optimisticallyUpdateTableOrder } from '../utils/staff-bill-cache.js';

interface UseStaffOrderActionsParams {
  tables: StaffTable[];
  setTables: React.Dispatch<React.SetStateAction<StaffTable[]>>;
  selectedTable?: StaffTable | null;
  setSelectedTable?: React.Dispatch<React.SetStateAction<StaffTable | null>>;
  showToast: (toast: {
    title: string;
    message?: string;
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
  }) => void;
  onMutationSuccess?: () => void;
}

export function useStaffOrderActions({
  tables,
  setTables,
  selectedTable,
  setSelectedTable,
  showToast,
  onMutationSuccess
}: UseStaffOrderActionsParams) {
  const [isMutating, setIsMutating] = useState(false);

  const handleQuickAcceptItem = useCallback(
    async (orderItemId: string, quantity: number) => {
      // 1. Optimistic Update (0ms perceived latency)
      const prevTables = tables;
      const prevSelected = selectedTable || null;

      const { updatedTables, targetTable } = optimisticallyUpdateTableOrder(
        tables,
        orderItemId,
        'ACCEPTED',
        { quantity }
      );
      setTables(updatedTables);
      if (setSelectedTable && targetTable && selectedTable?.table_id === targetTable.table_id) {
        setSelectedTable(targetTable);
      }

      // 2. Perform API Mutation in background
      try {
        await request(`/staff/order-items/${orderItemId}/accept`, {
          method: 'POST',
          body: JSON.stringify({ quantity })
        });
        onMutationSuccess?.();
      } catch (err: any) {
        // Rollback on network/validation error
        setTables(prevTables);
        if (setSelectedTable) setSelectedTable(prevSelected);
        showToast({ title: err.message || 'Lỗi nhận món', type: 'error' });
      }
    },
    [tables, selectedTable, setTables, setSelectedTable, showToast, onMutationSuccess]
  );

  const handleQuickServeItem = useCallback(
    async (orderItemId: string, quantity: number) => {
      // 1. Optimistic Update (0ms perceived latency)
      const prevTables = tables;
      const prevSelected = selectedTable || null;

      const { updatedTables, targetTable } = optimisticallyUpdateTableOrder(
        tables,
        orderItemId,
        'SERVED',
        { quantity }
      );
      setTables(updatedTables);
      if (setSelectedTable && targetTable && selectedTable?.table_id === targetTable.table_id) {
        setSelectedTable(targetTable);
      }

      // 2. Perform API Mutation in background
      try {
        await request(`/staff/order-items/${orderItemId}/serve`, {
          method: 'POST',
          body: JSON.stringify({ quantity })
        });
        onMutationSuccess?.();
      } catch (err: any) {
        // Rollback on network/validation error
        setTables(prevTables);
        if (setSelectedTable) setSelectedTable(prevSelected);
        showToast({ title: err.message || 'Lỗi phục vụ', type: 'error' });
      }
    },
    [tables, selectedTable, setTables, setSelectedTable, showToast, onMutationSuccess]
  );

  const handleQuickCancelItem = useCallback(
    async (
      orderItemId: string,
      payload: { quantity: number; reason: string; markOutOfStock: boolean }
    ) => {
      // 1. Optimistic Update (0ms perceived latency)
      const prevTables = tables;
      const prevSelected = selectedTable || null;

      const { updatedTables, targetTable } = optimisticallyUpdateTableOrder(
        tables,
        orderItemId,
        'CANCELLED',
        { quantity: payload.quantity, cancelReason: payload.reason }
      );
      setTables(updatedTables);
      if (setSelectedTable && targetTable && selectedTable?.table_id === targetTable.table_id) {
        setSelectedTable(targetTable);
      }

      // 2. Perform API Mutation in background
      try {
        await request(`/staff/order-items/${orderItemId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            quantity: payload.quantity,
            reason: payload.reason,
            markItemOutOfStock: payload.markOutOfStock
          })
        });
        showToast({
          title: payload.markOutOfStock
            ? 'Đã hủy món và cập nhật HẾT HÀNG trên thực đơn'
            : 'Đã hủy món thành công',
          type: 'warning',
          duration: 3500
        });
        onMutationSuccess?.();
      } catch (err: any) {
        // Rollback on network/validation error
        setTables(prevTables);
        if (setSelectedTable) setSelectedTable(prevSelected);
        showToast({ title: err.message || 'Lỗi hủy món', type: 'error' });
      }
    },
    [tables, selectedTable, setTables, setSelectedTable, showToast, onMutationSuccess]
  );

  const handleQuickAcceptAll = useCallback(
    async (sessionId: string) => {
      try {
        setIsMutating(true);
        await request(`/staff/sessions/${sessionId}/accept-all`, { method: 'POST' });
        showToast({ title: 'Đã tiếp nhận tất cả món', type: 'success', duration: 3000 });
        onMutationSuccess?.();
      } catch (err: any) {
        showToast({ title: err.message || 'Lỗi tiếp nhận món', type: 'error' });
      } finally {
        setIsMutating(false);
      }
    },
    [showToast, onMutationSuccess]
  );

  const handleQuickServeAll = useCallback(
    async (sessionId: string) => {
      try {
        setIsMutating(true);
        await request(`/staff/sessions/${sessionId}/serve-all`, { method: 'POST' });
        showToast({ title: 'Đã đánh dấu phục vụ tất cả món', type: 'success', duration: 3000 });
        onMutationSuccess?.();
      } catch (err: any) {
        showToast({ title: err.message || 'Lỗi phục vụ', type: 'error' });
      } finally {
        setIsMutating(false);
      }
    },
    [showToast, onMutationSuccess]
  );

  return {
    isMutating,
    handleQuickAcceptItem,
    handleQuickServeItem,
    handleQuickCancelItem,
    handleQuickAcceptAll,
    handleQuickServeAll
  };
}
