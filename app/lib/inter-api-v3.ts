
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

    public async makeRequest(options: https.RequestOptions, body?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
                    } else {
                        reject({ statusCode: res.statusCode, message: data, headers: res.headers });
                    }
                });
            });
            req.on('error', (error) => { reject(error); });
            if (body) req.write(body);
            req.end();
        });
    }

    async getAccessToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

        const params = new URLSearchParams();
        params.append('client_id', this.config.clientId);
        params.append('client_secret', this.config.clientSecret);
        params.append('scope', 'pix.read pix.write webhook.read webhook.write boleto-cobranca.read boleto-cobranca.write');
        params.append('grant_type', 'client_credentials');

        const body = params.toString();
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
            family: 4
        };

        const data = await this.makeRequest(options, body);
        this.accessToken = data.access_token;
        this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;
        return this.accessToken!;
    }

    async createBilling(payload: any) {
        const token = await this.getAccessToken();
        const body = JSON.stringify(payload);

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
            family: 4
        };

        const response = await this.makeRequest(options, body);
        return response;
    }

    async getBillingBySolicitacao(codigoSolicitacao: string) {
        const token = await this.getAccessToken();
        const options: https.RequestOptions = {
            hostname: 'cdpj.partners.bancointer.com.br',
            port: 443,
            path: `/cobranca/v3/cobrancas/${codigoSolicitacao}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            cert: this.config.cert,
            key: this.config.key,
            rejectUnauthorized: false,
            family: 4,
            timeout: 10000
        };

        return await this.makeRequest(options);
    }

    async listBillings(startDate: string, endDate: string, extraParams: string = '') {
        const token = await this.getAccessToken();
        const options: https.RequestOptions = {
            hostname: 'cdpj.partners.bancointer.com.br',
            port: 443,
            path: `/cobranca/v3/cobrancas?dataInicial=${startDate}&dataFinal=${endDate}${extraParams}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            cert: this.config.cert,
            key: this.config.key,
            rejectUnauthorized: false,
            family: 4
        };

        return await this.makeRequest(options);
    }

    async registerWebhook(webhookUrl: string, type: 'boleto' | 'pix', pixKey?: string) {
        const token = await this.getAccessToken();
        let path = type === 'boleto' ? '/cobranca/v3/cobrancas/webhook' : `/pix/v2/webhook/${pixKey}`;
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

        await this.makeRequest(options, body);
        return { success: true };
    }

    async getBillingPdf(nossoNumero: string): Promise<Buffer> {
        const token = await this.getAccessToken();
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
            family: 4
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                const chunks: any[] = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(Buffer.concat(chunks));
                    } else {
                        const errorBody = Buffer.concat(chunks).toString();
                        console.error(`[INTER PDF ERROR] Status: ${res.statusCode} | ID: ${nossoNumero} | Response: ${errorBody}`);
                        reject(new Error(`Erro Inter ${res.statusCode}: ${errorBody}`));
                    }
                });
            });

            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('Timeout ao baixar PDF do Inter (15s)'));
            });

            req.on('error', (e) => {
                console.error(`[INTER PDF REQ ERROR] ${e.message}`);
                reject(e);
            });
            req.end();
        });
    }
}
