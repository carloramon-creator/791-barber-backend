import { NextResponse } from 'next/server';
import { getSystemInterClient } from '@/app/lib/inter-api';

export async function GET(req: Request) {
    try {
        const client = await getSystemInterClient();

        if (!client) {
            return NextResponse.json({
                error: 'Client is null',
                env_vars_check: {
                    has_id: !!process.env.INTER_CLIENT_ID,
                    has_secret: !!process.env.INTER_CLIENT_SECRET,
                    has_cert: !!process.env.INTER_CERT_CONTENT,
                    has_key: !!process.env.INTER_KEY_CONTENT
                }
            });
        }

        // @ts-ignore
        const config = client.config;

        // Perform DNS and Connectivity Test
        let dnsResult = 'Not Tested';
        let googleResult = 'Not Tested';

        try {
            const dns = await fetch('https://cdp.inter.co', { method: 'HEAD' }).catch(e => e.message);
            // @ts-ignore
            dnsResult = dns.status ? `Status: ${dns.status}` : `Error: ${dns}`;
        } catch (e: any) {
            dnsResult = e.message;
        }

        try {
            const goog = await fetch('https://www.google.com', { method: 'HEAD' }).catch(e => e.message);
            // @ts-ignore
            googleResult = goog.status ? `Status: ${goog.status}` : `Error: ${goog}`;
        } catch (e: any) {
            googleResult = e.message;
        }

        return NextResponse.json({
            status: 'Configuration Loaded',
            connectivity_test: {
                inter: { target: 'https://cdp.inter.co', result: dnsResult },
                google: { target: 'https://google.com', result: googleResult }
            },
            cert_details: {
                length: config.cert?.length || 0,
                starts_with_begin: config.cert?.includes('BEGIN CERTIFICATE'),
                has_newlines: config.cert?.includes('\n'),
                preview: config.cert?.substring(0, 50) + '...'
            },
            key_details: {
                length: config.key?.length || 0,
                starts_with_begin: config.key?.includes('BEGIN PRIVATE KEY'),
                has_newlines: config.key?.includes('\n'),
                preview: config.key?.substring(0, 50) + '...'
            },
            env_vars_raw_check: {
                cert_from_env_length: process.env.INTER_CERT_CONTENT?.length || 0,
                key_from_env_length: process.env.INTER_KEY_CONTENT?.length || 0
            }
        });

    } catch (error: any) {
        return NextResponse.json({
            error: 'Crash during config load',
            message: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
