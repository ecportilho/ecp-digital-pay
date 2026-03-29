import { useState, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    </div>
  );
}
