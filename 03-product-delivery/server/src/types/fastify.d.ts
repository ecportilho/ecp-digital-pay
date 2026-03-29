import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** App autenticado via X-API-Key (middleware api-key-auth) */
    sourceApp?: {
      id: string;
      app_name: string;
      callback_base_url: string;
    };
    /** Usuário admin autenticado via JWT (middleware admin-auth) */
    adminUser?: {
      id: string;
      name: string;
      email: string;
      role: 'admin' | 'operator' | 'viewer';
    };
  }
}
