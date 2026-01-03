import Stripe from 'stripe';

// Inicializar cliente Stripe com a secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

export const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-12-15.clover' as any,
    typescript: true,
});

// Mapeamento de planos para Price IDs do Stripe
// IMPORTANTE: Substitua pelos IDs reais após criar os produtos no Stripe Dashboard
export const STRIPE_PRICE_IDS = {
    basic: process.env.STRIPE_PRICE_BASIC || 'price_1SlEJ2LzRSgzMHRZERmJwYgH',
    complete: process.env.STRIPE_PRICE_COMPLETE || 'price_1SlEJbLzRSgzMHRZAleKdO0C',
    premium: process.env.STRIPE_PRICE_PREMIUM || 'price_1SlEK9LzRSgzMHRZuw1ZcbwS',
} as const;

export type StripePlan = keyof typeof STRIPE_PRICE_IDS;
