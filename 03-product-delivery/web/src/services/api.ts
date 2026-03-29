const BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiService {
  private getToken(): string | null {
    return localStorage.getItem('ecp-pay-token');
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      localStorage.removeItem('ecp-pay-token');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>('GET', url);
  }

  post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', url, body);
  }

  patch<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', url, body);
  }

  delete<T>(url: string): Promise<T> {
    return this.request<T>('DELETE', url);
  }
}

export const api = new ApiService();
