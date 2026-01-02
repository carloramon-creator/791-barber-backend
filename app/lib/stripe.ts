import Stripe from 'stripe';

// Inicializar cliente Stripe com a secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    throw new Error(
        'STRIPE_SECRET_KEY não está configurada. Configure a variável de ambiente.'
    );
}

export const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
    typescript: true,
});

// Mapeamento de planos para Price IDs do Stripe
// IMPORTANTE: Substitua pelos IDs reais após criar os produtos no Stripe Dashboard
export const STRIPE_PRICE_IDS = {
    basic: process.env.STRIPE_PRICE_BASIC || 'price_basic_placeholder',
    complete: process.env.STRIPE_PRICE_COMPLETE || 'price_complete_placeholder',
    premium: process.env.STRIPE_PRICE_PREMIUM || 'price_premium_placeholder',
} as const;

export type StripePlan = keyof typeof STRIPE_PRICE_IDS;
