import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { backendAvailable } from '@/lib/backend';
export default function Login() {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    // Show the last error set by AuthContext, but clear stale offline errors
    // as soon as the backend is confirmed reachable.
    useEffect(() => {
        const msg = localStorage.getItem('pos-login-last-error');
        if (msg && msg.includes('Premi')) {
            localStorage.removeItem('pos-login-last-error');
            setError('');
            return;
        }
        if (msg)
            setError(msg);
        void backendAvailable(5000, true).then((ok) => {
            if (!ok)
                return;
            localStorage.removeItem('pos-login-last-error');
            setError('');
        }).catch(() => { });
    }, []);
    // local form submit loading
    const [submitting, setSubmitting] = useState(false);
    const { login, user, isLocked, isLoading } = useAuth();
    const navigate = useNavigate();
    // If user is already logged in, redirect them according to role
    useEffect(() => {
        if (!user)
            return;
        // Admins and super_admin -> dashboard, others (cashier) -> pos
        const role = (user as any).role || '';
        if (role === 'admin' || role === 'super_admin') {
            navigate('/dashboard');
        }
        else if (role === 'ambassador') {
            navigate('/ambassador-dashboard');
        }
        else {
            navigate('/pos');
        }
    }, [user, navigate]);
    // If we have a locked session, we don't navigate away to /pin; an overlay will
    // be shown so the user can unlock without losing current page state.
    useEffect(() => {
        if (!isLocked || user)
            return;
    }, [isLocked, user, navigate]);
    // While auth is initializing, don't show the login form (avoid flash)
    if (isLoading) {
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>);
    }
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        // Concatène le préfixe et le numéro
        const fullPhone = `+226${phone}`;
        const success = await login(fullPhone, password);
        if (success) {
            localStorage.removeItem('pos-login-last-error');
            navigate('/');
        }
        else {
            const msg = localStorage.getItem('pos-login-last-error') || 'Numéro de téléphone ou mot de passe incorrect';
            setError(msg);
        }
        setSubmitting(false);
    };
    return (<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center shadow-md">
            <ShoppingCart className="w-8 h-8 text-primary-foreground"/>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">START POS</CardTitle>
            <CardDescription className="text-base mt-2">
              Connectez-vous pour accéder à votre mogasin.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (<Alert variant="destructive">
                <AlertCircle className="h-4 w-4"/>
                <AlertDescription>{error}</AlertDescription>
              </Alert>)}
            
            <div className="space-y-2">
              <Label htmlFor="phone">Numéro de téléphone</Label>
                <div className="mb-4">
                  <label htmlFor="phone" className="block font-medium mb-1">Téléphone *</label>
                  <div className="flex">
                    <span className="px-3 py-2 bg-gray-100 border border-r-0 rounded-l-md text-gray-700 select-none">+226</span>
                    <input type="text" id="phone" name="phone" maxLength={8} pattern="[0-9]{8}" required className="border rounded-r-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Numéro (8 chiffres)" value={phone} onChange={e => {
            // N'accepte que les chiffres et max 8 caractères
            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
            setPhone(val);
        }}/>
                  </div>
                  {phone.length > 0 && phone.length < 8 && (<p className="text-red-500 text-sm mt-1">Le numéro doit comporter 8 chiffres.</p>)}
                </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Entrez votre mot de passe" required/>
            </div>
            
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>);
}
