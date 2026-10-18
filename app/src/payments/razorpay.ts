/**
 * Razorpay Checkout, on the web: its script is loaded the first time someone pays, and opens
 * Razorpay's own payment window (cards, UPI, net banking, wallets). The app never sees card
 * details; it gets back a payment id signed by Razorpay, which the server checks.
 */
import type { Checkout } from '@/api/endpoints';
import { colors } from '@/theme';

export const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

export interface Paid {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface Options {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { email: string; name: string };
  theme: { color: string };
  handler: (response: Paid) => void;
  modal: { ondismiss: () => void };
}

interface Instance {
  open(): void;
  on(
    event: 'payment.failed',
    listener: (response: { error: { description: string } }) => void,
  ): void;
}

export type RazorpayClass = new (options: Options) => Instance;

interface Page {
  document?: {
    createElement(tag: 'script'): {
      src: string;
      async: boolean;
      onload: (() => void) | null;
      onerror: (() => void) | null;
    };
    head: { appendChild(node: unknown): void };
  };
  Razorpay?: RazorpayClass;
}

/** The window closed without a payment; `failure` says why the last attempt failed, if one did. */
export class CheckoutClosed extends Error {
  constructor(readonly failure: string | null) {
    super(failure ?? 'Payment cancelled.');
    this.name = 'CheckoutClosed';
  }
}

let loading: Promise<RazorpayClass> | null = null;

/** Razorpay's script, loaded once. */
export function loadRazorpay(page: Page = globalThis as Page): Promise<RazorpayClass> {
  if (page.Razorpay !== undefined) return Promise.resolve(page.Razorpay);
  const doc = page.document;
  if (doc === undefined) {
    return Promise.reject(new Error('Paying works on the ClawPlay website for now.'));
  }
  loading ??= new Promise<RazorpayClass>((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      page.Razorpay !== undefined
        ? resolve(page.Razorpay)
        : reject(new Error('Razorpay could not be loaded.'));
    script.onerror = () => {
      loading = null; // try again next time
      reject(new Error('Razorpay could not be loaded. Check your connection and try again.'));
    };
    doc.head.appendChild(script);
  });
  return loading;
}

/** Take the payment for an order; resolves once paid, rejects with CheckoutClosed if not. */
export function pay(Razorpay: RazorpayClass, order: Checkout): Promise<Paid> {
  return new Promise((resolve, reject) => {
    let failure: string | null = null;
    const window = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: { email: order.email, name: order.username },
      theme: { color: colors.accent },
      handler: resolve,
      modal: { ondismiss: () => reject(new CheckoutClosed(failure)) },
    });
    window.on('payment.failed', (response) => {
      failure = response.error.description;
    });
    window.open();
  });
}

/** For tests: forget the loaded script. */
export function resetRazorpay() {
  loading = null;
}
