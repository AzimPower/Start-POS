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
            const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/stores.php');
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
    return (<div className="fixed inset-0 z-50 bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-start justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8 overflow-y-auto">
      <Card className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl shadow-2xl border-2 border-red-200 my-8">
        <CardHeader className="bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-t-lg pb-8 sm:pb-10">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="p-3 sm:p-4 bg-white/20 rounded-full shrink-0">
              <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12"/>
            </div>
            <div>
              <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold">Abonnement Expiré</CardTitle>
              <CardDescription className="text-white/90 text-base sm:text-lg mt-1">
                {storeName ? `Magasin: ${storeName}` : 'Accès suspendu'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 sm:pt-8 lg:pt-10 space-y-6 sm:space-y-8">
          {/* Message principal */}
          <div className="bg-red-50 border-l-4 border-red-500 p-4 sm:p-6 rounded-lg">
            <p className="text-gray-800 font-medium text-base sm:text-lg">
              🔒 L'accès à votre point de vente est temporairement suspendu
            </p>
            <p className="text-gray-600 text-sm sm:text-base mt-2">
              Votre abonnement mensuel a expiré {subscriptionEnd && `le ${subscriptionEnd}`}. 
              Pour continuer à utiliser le système POS, veuillez renouveler votre abonnement.
            </p>
          </div>

          {/* Informations de contact */}
          <div className="space-y-4 sm:space-y-5">
            <h3 className="font-semibold text-lg sm:text-xl lg:text-2xl text-gray-900 flex items-center gap-2">
              <Phone className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/>
              Pour réactiver votre compte
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* WhatsApp */}
              <a href="https://wa.me/22672210216" target="_blank" rel="noopener noreferrer" className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 sm:p-5 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 hover:shadow-md transition-all group">
                <div className="p-2 sm:p-3 bg-green-500 rounded-full shrink-0">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">WhatsApp</p>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">+226 72 21 02 16</p>
                </div>
                <span className="hidden sm:inline text-green-600 group-hover:translate-x-1 transition-transform text-xl">→</span>
              </a>

              {/* Téléphone */}
              <a href="tel:+22670000000" className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 sm:p-5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:shadow-md transition-all group">
                <div className="p-2 sm:p-3 bg-blue-500 rounded-full shrink-0">
                  <Phone className="w-5 h-5 sm:w-6 sm:h-6 text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">Appel direct</p>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">+226 70 00 00 00</p>
                </div>
                <span className="hidden sm:inline text-blue-600 group-hover:translate-x-1 transition-transform text-xl">→</span>
              </a>

              {/* Email */}
              <a href="mailto:support@votre-domaine.com" className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 sm:p-5 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 hover:shadow-md transition-all group sm:col-span-2 lg:col-span-1">
                <div className="p-2 sm:p-3 bg-purple-500 rounded-full shrink-0">
                  <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">Email</p>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">support@votre-domaine.com</p>
                </div>
                <span className="hidden sm:inline text-purple-600 group-hover:translate-x-1 transition-transform text-xl">→</span>
              </a>
            </div>
          </div>

          {/* Tarifs */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-5 sm:p-6 lg:p-8 rounded-lg border border-purple-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 sm:mb-3 text-base sm:text-lg lg:text-xl">💳 Tarif d'abonnement</h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary">15.000 FCFA</span>
                  <span className="text-gray-600 text-base sm:text-lg">/ mois</span>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-sm sm:text-base text-gray-600 space-y-1">
                  <span className="block">✓ Accès illimité au système POS</span>
                  <span className="block">✓ Synchronisation cloud</span>
                  <span className="block">✓ Support technique inclus</span>
                  <span className="block">✓ Mises à jour automatiques</span>
                </p>
              </div>
            </div>
          </div>

          {/* Boutons : Vérifier & Déconnexion */}
          <div className="pt-4 sm:pt-6 border-t">
            <div className="grid gap-3 sm:grid-cols-[1.3fr_0.7fr] items-center bg-white/70 border border-gray-200 rounded-xl p-3 sm:p-4">
              <Button onClick={handleCheckAgain} disabled={checking} className="w-full text-base sm:text-lg h-12 sm:h-14 justify-center" size="lg">
                {checking ? (<>
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin"/>
                    Vérification en cours...
                  </>) : (<>
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-2"/>
                    Vérifier l’abonnement
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
        }} className="w-full h-12 sm:h-14 bg-orange-500 hover:bg-orange-600 text-white" size="lg">
                Déconnexion
              </Button>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 text-center mt-2 sm:mt-3">
              Après renouvellement, cliquez sur “Vérifier”. Sinon, déconnectez-vous pour revenir à l’écran de connexion.
            </p>
          </div>

          {/* Note légale */}
          <div className="text-xs sm:text-sm text-gray-500 text-center pt-4 sm:pt-6 border-t space-y-1">
            <p>Vos données sont conservées et seront restaurées dès le renouvellement</p>
            <p>En cas de non-renouvellement après 30 jours, vos données seront archivées</p>
          </div>
        </CardContent>
      </Card>
    </div>);
}
