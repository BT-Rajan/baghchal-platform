import type { Checkout } from '@/api/endpoints';

import {
  CheckoutClosed,
  loadRazorpay,
  pay,
  resetRazorpay,
  SCRIPT,
  type RazorpayClass,
} from './razorpay';

const ORDER: Checkout = {
  key_id: 'rzp_test_k',
  order_id: 'order_1',
  amount_paise: 14900,
  currency: 'INR',
  name: 'ClawPlay',
  description: 'ClawPlay Plus for a month',
  email: 'alice@example.com',
  username: 'alice',
};

function page(behaviour: 'load' | 'empty' | 'error') {
  const Razorpay = jest.fn() as unknown as RazorpayClass;
  const appended: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  const target: Record<string, unknown> = {
    document: {
      createElement: () => ({ src: '', async: false, onload: null, onerror: null }),
      head: {
        appendChild: (script: (typeof appended)[number]) => {
          appended.push(script);
          if (behaviour === 'load') target.Razorpay = Razorpay;
          if (behaviour === 'error') script.onerror?.();
          else script.onload?.();
        },
      },
    },
  };
  return { target, appended, Razorpay };
}

beforeEach(resetRazorpay);

test("Razorpay's script is loaded once", async () => {
  const { target, appended, Razorpay } = page('load');
  await expect(loadRazorpay(target)).resolves.toBe(Razorpay);
  await expect(loadRazorpay(target)).resolves.toBe(Razorpay);
  expect(appended.map((s) => s.src)).toEqual([SCRIPT]);
});

test('a script that fails can be tried again', async () => {
  const { target } = page('error');
  await expect(loadRazorpay(target)).rejects.toThrow('Razorpay could not be loaded. Check');
  await expect(loadRazorpay(target)).rejects.toThrow('Check your connection');
  const empty = page('empty');
  resetRazorpay();
  await expect(loadRazorpay(empty.target)).rejects.toThrow('Razorpay could not be loaded.');
});

test('no web page, no Checkout', async () => {
  await expect(loadRazorpay({})).rejects.toThrow('Paying works on the ClawPlay website');
});

test('paying resolves with the signed payment, or rejects when closed', async () => {
  let made: { options: Record<string, never>; failed?: (r: unknown) => void } | null = null;
  const Razorpay = jest.fn(function (this: unknown, options: Record<string, never>) {
    made = { options };
    return {
      open: jest.fn(),
      on: (_: string, listener: (r: unknown) => void) => {
        made!.failed = listener;
      },
    };
  }) as unknown as RazorpayClass;

  const paid = pay(Razorpay, ORDER);
  const options = made!.options as unknown as {
    key: string;
    order_id: string;
    amount: number;
    prefill: unknown;
    handler: (r: unknown) => void;
    modal: { ondismiss: () => void };
  };
  expect([options.key, options.order_id, options.amount]).toEqual(['rzp_test_k', 'order_1', 14900]);
  expect(options.prefill).toEqual({ email: 'alice@example.com', name: 'alice' });
  const signed = {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: 's',
  };
  options.handler(signed);
  await expect(paid).resolves.toEqual(signed);

  const closed = pay(Razorpay, ORDER);
  made!.failed!({ error: { description: 'Card declined' } });
  (made!.options as unknown as { modal: { ondismiss: () => void } }).modal.ondismiss();
  await expect(closed).rejects.toEqual(new CheckoutClosed('Card declined'));
});
