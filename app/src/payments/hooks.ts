import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CheckoutRequest, PaymentKeysRequest } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';

import { loadRazorpay, pay } from './razorpay';

export function usePayments() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.payments, queryFn: ({ signal }) => api.payments(signal) });
}

/**
 * Buy a plan: an order from the server, Razorpay's window to pay it, then the server confirms the
 * payment and gives the plan.
 */
export function useBuy() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (choice: CheckoutRequest) => {
      // Razorpay first: no order is made where it cannot be paid.
      const razorpay = await loadRazorpay();
      const order = await api.checkout(choice);
      const paid = await pay(razorpay, order);
      return api.verifyPayment({
        order_id: paid.razorpay_order_id,
        payment_id: paid.razorpay_payment_id,
        signature: paid.razorpay_signature,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myPlan });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments });
    },
  });
}

/** The payments page's keys, for an admin who entered the emailed code (else admin_code_needed). */
export function usePaymentKeys() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.paymentKeys,
    queryFn: ({ signal }) => api.paymentKeys(signal),
    retry: false,
  });
}

/** Ask for the code, and enter it: the page opens on this device for 15 minutes. */
export function useAdminCode() {
  const api = useApi();
  const queryClient = useQueryClient();
  const send = useMutation({ mutationFn: () => api.sendAdminCode() });
  const check = useMutation({
    mutationFn: (code: string) => api.checkAdminCode(code),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.paymentKeys }),
  });
  return { send, check };
}

/** Set or remove the keys; payments start or stop at once. */
export function useChangePaymentKeys() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keys: PaymentKeysRequest | null) =>
      keys === null ? api.removePaymentKeys() : api.setPaymentKeys(keys),
    onSuccess: (page) => {
      queryClient.setQueryData(queryKeys.paymentKeys, page);
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments });
    },
  });
}
