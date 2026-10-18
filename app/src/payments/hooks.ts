import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CheckoutRequest } from '@/api/endpoints';
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
      const order = await api.checkout(choice);
      const paid = await pay(await loadRazorpay(), order);
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
