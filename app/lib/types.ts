export type Plan = 'basic' | 'complete' | 'premium' | 'trial';
export type UserRole = 'owner' | 'barber' | 'client' | 'staff';
export type BarberStatus = 'available' | 'busy';
export type QueueStatus = 'waiting' | 'attending' | 'finished' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'pix';
export type FinanceType = 'revenue' | 'expense';

export interface Tenant {
    id: string;
    name: string;
    plan: Plan;
    stripe_id?: string;
    cnpj?: string;
    phone?: string;
    address?: string;
    logo_url?: string;
    created_at: string;
}

export interface User {
    id: string;
    tenant_id: string;
    role: UserRole;
    name?: string;
    photo_url?: string;
    created_at: string;
}

export interface Barber {
    id: string;
    tenant_id: string;
    name: string;
    photo_url?: string;
    status: BarberStatus;
    avg_time_minutes: number;
    created_at: string;
}

export interface ClientQueue {
    id: string;
    tenant_id: string;
    barber_id: string;
    client_id?: string;
    client_name: string;
    status: QueueStatus;
    position: number;
    estimated_time_minutes?: number;
    started_at?: string;
    finished_at?: string;
    created_at: string;
}

export interface Service {
    id: string;
    tenant_id: string;
    name: string;
    price: number;
    created_at: string;
}

export interface Product {
    id: string;
    tenant_id: string;
    name: string;
    price: number;
    created_at: string;
}

export interface Sale {
    id: string;
    tenant_id: string;
    client_queue_id: string;
    services?: { id: string; qty: number }[];
    products?: { id: string; qty: number }[];
    total: number;
    payment_method: PaymentMethod;
    pix_payload?: string;
    paid: boolean;
    created_at: string;
}

export interface Finance {
    id: string;
    tenant_id: string;
    type: FinanceType;
    value: number;
    description?: string;
    date: string;
    created_at: string;
}
