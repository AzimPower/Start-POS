import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, Phone, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDB } from '@/lib/db';
interface SubscriptionExpiredProps {
    storeName?: string;
    onCheckAgain?: () => void;
}
export default function SubscriptionExpired({ storeName, onCheckAgain }: SubscriptionExpiredProps) {
    const [checking, setChecking] = useState(false);
    const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
    const { logout } = useAuth();
    const navigate = useNavigate();
    // Récupérer les informations de l'abonnement au chargement
    useEffect(() => {
        const loadSubscriptionInfo = async () => {
            try {
                const db = await getDB();
                const stores = await db.getAll('stores');
                const currentStore = stores.find(s => s.name === storeName);
                if (currentStore?.subscriptionEnd) {
                    const endDate = new Date(currentStore.subscriptionEnd);
                    setSubscriptionEnd(endDate.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    }));
                }
            }
            catch (error) {
            }
        };
        loadSubscriptionInfo();
    }, [storeName]);
    const handleCheckAgain = async () => {
        setChecking(true);
        try {
            // Vérifier le statut du magasin via l'API
        const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php?include_inactive=1&_ts=' + Date.now(), { cache: 'no-store' });
            if (response.ok) {
                const stores = await response.json();
                const db = await getDB();
                // Mettre à jour les stores en local
                for (const store of stores) {
                    await db.put('stores', store);
                }
                // Callback pour re-vérifier
                if (onCheckAgain) {
                    onCheckAgain();
                }
            }
        }
        catch (error) {
        }
        finally {
            setChecking(false);
        }
    };
    return (<div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <Card className="mx-auto w-full max-w-6xl border-2 border-red-200 shadow-2xl lg:flex lg:h-[min(760px,calc(100dvh-2rem))] lg:flex-col lg:overflow-hidden">
        <CardHeader className="shrink-0 bg-gradient-to-r from-red-500 to-orange-500 px-4 py-4 text-white sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-5">
            <div className="rounded-2xl bg-white/20 p-2.5 sm:p-3 lg:p-4 shrink-0">
              <AlertCircle className="h-7 w-7 sm:h-8 sm:w-8 lg:h-10 lg:w-10"/>
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">Abonnement expiré</CardTitle>
              <CardDescription className="mt-1 text-sm text-white/90 sm:text-base lg:text-lg">
                {storeName ? `Magasin : ${storeName}` : 'Accès suspendu'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col px-4 py-4 sm:px-6 sm:py-5 lg:min-h-0 lg:flex-1 lg:px-8 lg:py-6">
          <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1.1fr_0.9fr] lg:gap-5">
            <div className="flex flex-col gap-4 lg:min-h-0">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 sm:px-5 sm:py-4">
                <p className="text-sm font-semibold text-gray-900 sm:text-base lg:text-lg">
                  Accès temporairement suspendu
                </p>
                <p className="mt-1.5 text-xs leading-5 text-gray-600 sm:text-sm lg:text-base lg:leading-6">
                  Votre abonnement mensuel a expiré {subscriptionEnd && `le ${subscriptionEnd}`}. Pour reprendre l'utilisation du POS, il faut renouveler l'abonnement puis relancer la vérification.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 sm:p-4 lg:p-5">
                <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                  <Button onClick={handleCheckAgain} disabled={checking} className="h-11 justify-center text-sm sm:h-12 sm:text-base">
                    {checking ? (<>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin sm:h-5 sm:w-5"/>
                        Vérification...
                      </>) : (<>
                        <RefreshCw className="mr-2 h-4 w-4 sm:h-5 sm:w-5"/>
                        Vérifier l'abonnement
                      </>)}
                  </Button>

                  <Button variant="default" onClick={async () => {
                try {
                    await logout();
                }
                catch (e) {
                }
                try {
                    navigate('/login');
                }
                catch (e) {
                    window.location.href = '/login';
                }
            }} className="h-11 bg-orange-500 text-sm text-white hover:bg-orange-600 sm:h-12 sm:text-base">
                    Déconnexion
                  </Button>
                </div>
                <p className="mt-2 text-center text-[11px] leading-4 text-gray-500 sm:mt-3 sm:text-xs lg:text-sm">
                  Après renouvellement, cliquez sur “Vérifier”. Sinon, revenez à la connexion.
                </p>
              </div>

              <div className="hidden rounded-2xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-xs leading-5 text-gray-500 lg:block">
                Vos données sont conservées et seront restaurées dès le renouvellement. En cas de non-renouvellement prolongé, elles pourront être archivées.
              </div>
            </div>

            <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[1fr_auto]">
              <div className="rounded-2xl border border-gray-200 bg-white/85 p-4 sm:p-5 lg:p-6">
                <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 sm:text-lg lg:text-xl">
                  <Phone className="h-4 w-4 text-primary sm:h-5 sm:w-5"/>
                  Réactiver votre compte
                </h3>

                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <a href="https://wa.me/22672210216" target="_blank" rel="noopener noreferrer" className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-3 py-3 transition-colors hover:bg-green-100 sm:min-h-[96px] lg:min-h-[88px]">
                    <div className="rounded-xl bg-green-500 p-2 text-white shrink-0">
                      <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5"/>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 sm:text-base">WhatsApp</p>
                      <p className="truncate text-xs text-gray-600 sm:text-sm">+226 72 21 02 16</p>
                    </div>
                  </a>

                  <a href="tel:+22670000000" className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 transition-colors hover:bg-blue-100 sm:min-h-[96px] lg:min-h-[88px]">
                    <div className="rounded-xl bg-blue-500 p-2 text-white shrink-0">
                      <Phone className="h-4 w-4 sm:h-5 sm:w-5"/>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 sm:text-base">Appel direct</p>
                      <p className="truncate text-xs text-gray-600 sm:text-sm">+226 70 00 00 00</p>
                    </div>
                  </a>

                  <a href="mailto:support@votre-domaine.com" className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-3 py-3 transition-colors hover:bg-purple-100 sm:min-h-[96px] lg:min-h-[88px]">
                    <div className="rounded-xl bg-purple-500 p-2 text-white shrink-0">
                      <Mail className="h-4 w-4 sm:h-5 sm:w-5"/>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 sm:text-base">Email</p>
                      <p className="truncate text-xs text-gray-600 sm:text-sm">support@votre-domaine.com</p>
                    </div>
                  </a>
                </div>
              </div>

            </div>
          </div>

          <div className="mt-3 shrink-0 text-center text-[10px] leading-4 text-gray-500 sm:mt-4 sm:text-xs lg:hidden">
            Vos données restent conservées jusqu'au renouvellement de l'abonnement.
          </div>
        </CardContent>
      </Card>
    </div>);
}
