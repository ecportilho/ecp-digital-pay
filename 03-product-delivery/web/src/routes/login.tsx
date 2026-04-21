import { useState, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Eye, EyeOff, X } from 'lucide-react';

const DEMO_ACCOUNTS: Array<{ email: string; password: string; role: string }> = [
  { email: 'admin@ecpay.dev', password: 'Admin@123', role: 'Admin do gateway' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  function handleQuickLogin(account: typeof DEMO_ACCOUNTS[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Credenciais invalidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-[400px] p-10">
        <div className="text-center mb-1">
          <div className="text-[28px] font-bold text-lime">&#x2B21; ECP Pay</div>
        </div>
        <div className="text-center text-[13px] text-text-tertiary mb-9">
          Payment Service
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Email"
            type="email"
            placeholder="admin@ecpay.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <Input
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            placeholder="........"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            iconRight={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="hover:text-text-primary transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          {error && (
            <p className="text-xs text-danger text-center bg-danger/10 rounded-control py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full justify-center py-3 text-[15px] mt-2">
            Entrar
          </Button>
        </form>

        <div className="text-center mt-8 text-text-tertiary text-xs">
          Ecossistema ECP &mdash; ecp-pay admin
        </div>
      </Card>

      {/* Acesso rapido demo — escondido atras de link discreto */}
      {!showDemo && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowDemo(true)}
            className="text-[11px] text-text-tertiary hover:text-text-secondary underline decoration-dotted underline-offset-4 opacity-60 hover:opacity-100 transition-opacity bg-transparent border-0 cursor-pointer"
            aria-label="Mostrar conta de demo"
            title="Acesso rapido para demo"
          >
            ·
          </button>
        </div>
      )}

      {showDemo && (
        <Card className="w-full max-w-[400px] p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-wider text-text-tertiary">
              Acesso rápido (demo)
            </div>
            <button
              type="button"
              onClick={() => setShowDemo(false)}
              className="text-text-tertiary hover:text-text-primary transition-colors bg-transparent border-0 cursor-pointer"
              aria-label="Fechar acesso rapido"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {DEMO_ACCOUNTS.map((account) => {
              const active = email === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => handleQuickLogin(account)}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-control text-left text-xs transition-colors border
                    ${active
                      ? 'bg-lime/10 border-lime text-lime'
                      : 'bg-background border-border text-text-primary hover:border-lime/40'}`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{account.email}</span>
                    <span className="text-[10px] text-text-tertiary truncate">Senha: {account.password}</span>
                  </div>
                  <span className="text-[10px] text-text-tertiary bg-secondary-bg px-2 py-0.5 rounded-full flex-shrink-0">
                    {account.role}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
