import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const key = process.env.STRIPE_SECRET_KEY || '';
    const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
    const webhook = process.env.STRIPE_WEBHOOK_SECRET || '';

    return NextResponse.json({
        status: 'Stripe Config Check',
        mode: key.startsWith('sk_live') ? 'LIVE (Production)' : 'TEST (Sandbox)',
        secret_key_preview: key.substring(0, 8) + '...',
        public_key_preview: pubKey.substring(0, 8) + '...',
        has_webhook_secret: !!webhook,
        webhook_preview: webhook.substring(0, 8) + '...'
    });
}
