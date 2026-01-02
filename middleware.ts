import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/app/lib/middleware'

export async function middleware(request: NextRequest) {
    const response = await updateSession(request)

    // Configuração de CORS para a API
    if (request.nextUrl.pathname.startsWith('/api')) {
        const origin = request.headers.get('origin')

        const isAllowed = origin && (
            origin.endsWith('791barber.com') ||
            origin.endsWith('vercel.app') ||
            origin.startsWith('http://localhost')
        );

        if (isAllowed) {
            response.headers.set('Access-Control-Allow-Origin', origin!);
        } else {
            // Fallback para o domínio oficial
            response.headers.set('Access-Control-Allow-Origin', 'https://791barber.com');
        }

        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info')
        response.headers.set('Access-Control-Allow-Credentials', 'true')

        // Tratar requisições OPTIONS (preflight)
        if (request.method === 'OPTIONS') {
            return new NextResponse(null, {
                status: 204,
                headers: response.headers
            })
        }
    }

    return response
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
