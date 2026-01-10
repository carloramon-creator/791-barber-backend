import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/app/lib/middleware'

export async function middleware(request: NextRequest) {
    const origin = request.headers.get('origin');

    // Configuração de CORS para a API
    if (request.nextUrl.pathname.startsWith('/api')) {
        // Tratar requisições OPTIONS (preflight) imediatamente
        if (request.method === 'OPTIONS') {
            const preflightResponse = new NextResponse(null, { status: 204 });

            if (origin) {
                preflightResponse.headers.set('Access-Control-Allow-Origin', origin);
            } else {
                preflightResponse.headers.set('Access-Control-Allow-Origin', '*');
            }

            preflightResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            preflightResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, x-tenant-id');
            preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true');

            return preflightResponse;
        }
    }

    const response = await updateSession(request);

    // Adicionar headers de CORS no response normal
    if (request.nextUrl.pathname.startsWith('/api')) {
        if (origin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        } else {
            response.headers.set('Access-Control-Allow-Origin', '*');
        }
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, x-tenant-id');
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
