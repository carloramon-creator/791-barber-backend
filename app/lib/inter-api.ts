import axios from 'axios';
import { supabaseAdmin } from './supabase';
import * as https from 'https';

interface InterConfig {
    clientId: string;
    clientSecret: string;
    cert: string;
    key: string;
}

export class InterAPI {
    private baseUrl = 'https://cdp.inter.co/pix/v2';
    private billingUrl = 'https://cdp.inter.co/cobranca/v3/cobrancas';
    private authUrl = 'https://cdp.inter.co/oauth/v2/token';
    private config: InterConfig;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor(config: InterConfig) {
        this.config = config;
    }

    private getAgent() {
        return new https.Agent({
            cert: this.config.cert,
            key: this.config.key,
            keepAlive: true,
            rejectUnauthorized: false // Necessary for Vercel/Node to accept mTLS
        });
    }

    async getAccessToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.tokenExpiresAt) {
            return this.accessToken;
        }

        const params = new URLSearchParams();
        params.append('client_id', this.config.clientId);
        params.append('client_secret', this.config.clientSecret);
        params.append('scope', 'pix.read pix.write webhook.read webhook.write boleto-cobranca.read boleto-cobranca.write');
        params.append('grant_type', 'client_credentials');

        try {
            const response = await axios.post(this.authUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                httpsAgent: this.getAgent()
            });

            const data = response.data;
            this.accessToken = data.access_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;
            return this.accessToken!;
        } catch (error: any) {
            console.error('Inter Auth Error Detailed:', error.response?.data || error.message);
            throw new Error(`Inter Auth Error: ${JSON.stringify(error.response?.data || error.message)}`);
        }
    }

    async createImmediateCharge(payload: {
        calendario: { expiracao: number };
        devedor?: { cpf?: string; cnpj?: string; nome: string };
        valor: { original: string };
        chave: string;
        solicitacaoPagador?: string;
    }) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/cob`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            // @ts-ignore
            agent: this.getAgent(),
        } as any);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Inter Pix Error: ${JSON.stringify(error)}`);
        }

        return await response.json();
    }

    async getCharge(txid: string) {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/cob/${txid}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            // @ts-ignore
            agent: this.getAgent(),
        } as any);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Inter Get Charge Error: ${JSON.stringify(error)}`);
        }

        return await response.json();
    }

    async setupWebhook(webhookUrl: string, chave: string) {
        // ... (existing pix webhook logic remains same)
        const token = await this.getAccessToken();

        const response = await fetch(`${this.baseUrl}/webhook/${chave}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ webhookUrl }),
            // @ts-ignore
            agent: this.getAgent(),
        } as any);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(`Inter Webhook Error: ${JSON.stringify(error)}`);
        }

        return true;
    }

    async createBilling(payload: any) {
        const token = await this.getAccessToken();

        try {
            const response = await axios.post(this.billingUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                httpsAgent: this.getAgent()
            });

            return response.data;
        } catch (error: any) {
            console.error('Inter Billing Error Detailed:', error.response?.data || error.message);
            throw new Error(`Inter Billing Error: ${JSON.stringify(error.response?.data || error.message)}`);
        }

    }

    async getBillingPdf(nossoNumero: string): Promise<Buffer> {
        const token = await this.getAccessToken();

        const response = await fetch(`${this.billingUrl}/${nossoNumero}/pdf`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            // @ts-ignore
            agent: this.getAgent(),
        } as any);

        if (!response.ok) {
            throw new Error(`Inter PDF Error: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}

export async function getInterClient(tenantId: string) {
    const { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .select('inter_client_id, inter_client_secret, inter_cert_content, inter_key_content')
        .eq('id', tenantId)
        .single();

    if (error || !tenant || !tenant.inter_client_id) {
        return null;
    }

    return new InterAPI({
        clientId: tenant.inter_client_id,
        clientSecret: tenant.inter_client_secret,
        cert: tenant.inter_cert_content,
        key: tenant.inter_key_content
    });
}

export async function getSystemInterClient() {
    const { data, error } = await supabaseAdmin
        .from('system_settings')
        .select('*')
        .eq('key', 'inter_config')
        .single();

    const config = data?.value;

    if (!config || !config.client_id) {
        // Fallback to env
        if (!process.env.INTER_CLIENT_ID) return null;
        return new InterAPI({
            clientId: process.env.INTER_CLIENT_ID,
            clientSecret: process.env.INTER_CLIENT_SECRET || '',
            cert: (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n'),
            key: (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n')
        });
    }

    return new InterAPI({
        clientId: config.client_id,
        clientSecret: config.client_secret,
        cert: config.crt,
        key: config.key
    });
}
