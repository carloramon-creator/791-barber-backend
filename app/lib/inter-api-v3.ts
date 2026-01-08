import * as https from 'https';

interface InterConfigV3 {
    clientId: string;
    clientSecret: string;
    cert: string;
    key: string;
}

export class InterAPIV3 {
    private config: InterConfigV3;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor(config: InterConfigV3) {
        this.config = config;
    }

    private async makeRequest(options: https.RequestOptions, body?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            resolve(data);
                        }
                    } else {
                        reject({
                            statusCode: res.statusCode,
                            message: data,
                            headers: res.headers
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body) {
                req.write(body);
            }

            req.end();
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

        const body = params.toString();

        console.log('[INTER V3] Requesting Token from: https://cdpj.partners.bancointer.com.br/oauth/v2/token');

        try {
            const options: https.RequestOptions = {
                hostname: 'cdpj.partners.bancointer.com.br',
                port: 443,
                path: '/oauth/v2/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body)
                },
                cert: this.config.cert,
                key: this.config.key,
                rejectUnauthorized: false,
                family: 4 // Force IPv4
            };

            const data = await this.makeRequest(options, body);

            this.accessToken = data.access_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;

            console.log('[INTER V3] Token obtained successfully');
            return this.accessToken!;
        } catch (error: any) {
            console.error('[INTER V3] Auth Error:', error);
            throw new Error(`Inter Auth Error: ${JSON.stringify(error)}`);
        }
    }

    async createBilling(payload: any) {
        const token = await this.getAccessToken();
        const body = JSON.stringify(payload);

        console.log('[INTER V3] Creating Billing');

        try {
            const options: https.RequestOptions = {
                hostname: 'cdpj.partners.bancointer.com.br',
                port: 443,
                path: '/cobranca/v3/cobrancas',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                },
                cert: this.config.cert,
                key: this.config.key,
                rejectUnauthorized: false,
                family: 4 // Force IPv4
            };

            const initialResponse = await this.makeRequest(options, body);

            // Se devolver direto os dados (síncrono), retorna
            if (initialResponse.nossoNumero) {
                return initialResponse;
            }

            // Se for assíncrono (só codigoSolicitacao), precisamos buscar os detalhes
            console.log('[INTER V3] Async response received, fetching details with retry logic...', initialResponse);

            // Ajuste de Fuso Horário: Buscar de ONTEM até AMANHÃ para evitar erros de servidor UTC vs BRT
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 2);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 2);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            console.log(`[INTER V3] Searching Date Range: ${yesterdayStr} to ${tomorrowStr}`);

            const maxRetries = 1;

            for (let i = 0; i < maxRetries; i++) {
                const waitTime = 1500;
                console.log(`[INTER V3] Fast Attempt ${i + 1}/${maxRetries} - Waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                const searchOptions: https.RequestOptions = {
                    hostname: 'cdpj.partners.bancointer.com.br',
                    port: 443,
                    path: `/cobranca/v3/cobrancas?seuNumero=${payload.seuNumero}&dataInicial=${yesterdayStr}&dataFinal=${tomorrowStr}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` },
                    cert: this.config.cert,
                    key: this.config.key,
                    rejectUnauthorized: false,
                    family: 4
                };

                try {
                    const searchResponse = await this.makeRequest(searchOptions);

                    const cobrancas = searchResponse.cobrancas || searchResponse.content || searchResponse;

                    if (Array.isArray(cobrancas) && cobrancas.length > 0) {
                        const cobrancaCompleta = cobrancas[0];
                        // Garantir que tem nossoNumero antes de retornar
                        if (cobrancaCompleta.nossoNumero) {
                            console.log('[INTER V3] Fetched full billing details:', cobrancaCompleta.nossoNumero);
                            return cobrancaCompleta;
                        }
                    }
                } catch (e) {
                    console.warn(`[INTER V3] Search attempt ${i + 1} failed:`, e);
                }
            }

            console.warn('[INTER V3] Billing not found via search after ALL retries. Returning pending status.');

            // Retorna sucesso PARCIAL para não travar o fluxo
            return {
                pending_processing: true,
                seuNumero: payload.seuNumero,
                codigoSolicitacao: initialResponse.codigoSolicitacao,
                message: 'Processamento do documento em andamento no banco.'
            };

        } catch (error: any) {
            console.error('[INTER V3] Billing Error (RAW):', error);

            let errorMsg = 'Unknown Error';
            if (error instanceof Error) {
                errorMsg = error.message;
            } else if (typeof error === 'object') {
                try {
                    errorMsg = JSON.stringify(error);
                } catch {
                    errorMsg = String(error);
                }
            } else {
                errorMsg = String(error);
            }

            throw new Error(`Inter Billing Error: ${errorMsg}`);
        }
    }

    async getBillingPdf(nossoNumero: string): Promise<Buffer> {
        const token = await this.getAccessToken();

        console.log(`[INTER V3] Fetching PDF for billing: ${nossoNumero}`);

        try {
            const options: https.RequestOptions = {
                hostname: 'cdpj.partners.bancointer.com.br',
                port: 443,
                path: `/cobranca/v3/cobrancas/${nossoNumero}/pdf`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                cert: this.config.cert,
                key: this.config.key,
                rejectUnauthorized: false,
                family: 4 // Force IPv4
            };

            const data = await this.makeRequest(options);

            if (data && data.pdf) {
                console.log('[INTER V3] PDF fetched successfully');
                return Buffer.from(data.pdf, 'base64');
            } else {
                throw new Error('PDF data not found in response');
            }
        } catch (error: any) {
            console.error('[INTER V3] PDF Error:', error);
            throw new Error(`Inter PDF Error: ${JSON.stringify(error)}`);
        }
    }

    async registerWebhook(webhookUrl: string, type: 'boleto' | 'pix', pixKey?: string) {
        const token = await this.getAccessToken();
        let path = '';

        if (type === 'boleto') {
            path = '/cobranca/v3/cobrancas/webhook';
        } else {
            if (!pixKey) throw new Error('Chave Pix é obrigatória para registrar webhook de Pix.');
            path = `/pix/v2/webhook/${pixKey}`;
        }

        console.log(`[INTER V3] Registering ${type} webhook to: ${webhookUrl} (Path: ${path})`);

        const body = JSON.stringify({ webhookUrl });

        const options: https.RequestOptions = {
            hostname: 'cdpj.partners.bancointer.com.br',
            port: 443,
            path: path,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            cert: this.config.cert,
            key: this.config.key,
            rejectUnauthorized: false,
            family: 4
        };

        try {
            await this.makeRequest(options, body);
            console.log(`[INTER V3] ${type} Webhook registered successfully!`);
            return { success: true, type };
        } catch (error: any) {
            console.error(`[INTER V3] Error registering ${type} webhook:`, error);
            throw new Error(`Inter Webhook Error (${type}): ${JSON.stringify(error)}`);
        }
    }
}
