import { NextResponse } from 'next/server';
import { InterAPIV2 } from '@/app/lib/inter-api-v2';

export async function GET(req: Request) {
    try {
        // 1. Verificar variáveis de ambiente
        const hasClientId = !!process.env.INTER_CLIENT_ID;
        const hasClientSecret = !!process.env.INTER_CLIENT_SECRET;
        const hasCert = !!process.env.INTER_CERT_CONTENT;
        const hasKey = !!process.env.INTER_KEY_CONTENT;

        const envCheck = {
            hasClientId,
            hasClientSecret,
            hasCert,
            hasKey,
            allPresent: hasClientId && hasClientSecret && hasCert && hasKey
        };

        console.log('[DEBUG INTER] Env Check:', envCheck);

        if (!envCheck.allPresent) {
            return NextResponse.json({
                status: 'error',
                message: 'Variáveis de ambiente do Inter incompletas',
                envCheck
            }, { status: 500 });
        }

        // 2. Tentar criar instância do Inter
        const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
        const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

        const inter = new InterAPIV2({
            clientId: process.env.INTER_CLIENT_ID!,
            clientSecret: process.env.INTER_CLIENT_SECRET || '',
            cert: cert,
            key: key
        });

        console.log('[DEBUG INTER] Instância criada');

        // 3. Tentar obter token
        let tokenResult = { success: false, error: null as any };
        try {
            const token = await inter.getAccessToken();
            tokenResult.success = true;
            console.log('[DEBUG INTER] Token obtido com sucesso:', token.substring(0, 20) + '...');
        } catch (error: any) {
            tokenResult.error = error.message;
            console.error('[DEBUG INTER] Erro ao obter token:', error);
        }

        // 4. Teste de conectividade
        let connectivityTest = { inter: 'not tested', google: 'not tested' };
        try {
            const interTest = await fetch('https://cdp.inter.co', { method: 'HEAD' });
            connectivityTest.inter = `Status: ${interTest.status}`;
        } catch (e: any) {
            connectivityTest.inter = `Error: ${e.message}`;
        }

        try {
            const googleTest = await fetch('https://www.google.com', { method: 'HEAD' });
            connectivityTest.google = `Status: ${googleTest.status}`;
        } catch (e: any) {
            connectivityTest.google = `Error: ${e.message}`;
        }

        return NextResponse.json({
            status: 'ok',
            envCheck,
            tokenResult,
            connectivityTest,
            certInfo: {
                length: cert.length,
                startsWithBegin: cert.includes('BEGIN CERTIFICATE'),
                hasNewlines: cert.includes('\n'),
                preview: cert.substring(0, 50) + '...'
            },
            keyInfo: {
                length: key.length,
                startsWithBegin: key.includes('BEGIN PRIVATE KEY') || key.includes('BEGIN RSA PRIVATE KEY'),
                hasNewlines: key.includes('\n'),
                preview: key.substring(0, 50) + '...'
            }
        });

    } catch (error: any) {
        console.error('[DEBUG INTER] Erro geral:', error);
        return NextResponse.json({
            status: 'error',
            message: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
