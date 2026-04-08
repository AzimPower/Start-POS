import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as NativePrinter from '@/lib/nativePrinter';
import * as secureStorage from '@/lib/secureStorage';
export default function PrinterDebug() {
    const [paired, setPaired] = useState<Array<{
        name: string;
        id: string;
    }>>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [connected, setConnected] = useState<boolean>(NativePrinter.isConnected());
    const [text, setText] = useState('TEST\nHello thermal printer\n');
    const [logs, setLogs] = useState<string[]>([]);
    const log = (msg: string) => {
        setLogs(l => [new Date().toLocaleTimeString() + ' - ' + msg, ...l].slice(0, 200));
    };
    const refresh = async () => {
        setLoading(true);
        try {
            const devices = await NativePrinter.listPaired();
            setPaired(devices || []);
            log(`Found ${devices.length} paired device(s)`);
        }
        catch (e) {
            toast.error('Erreur lors de la récupération des appareils');
            log('listPaired error: ' + String(e));
            setPaired([]);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        (async () => {
            try {
                const s = await secureStorage.getItem('printer_mac');
                if (s)
                    setSelected(s);
                else
                    setSelected(localStorage.getItem('printer_mac') || null);
            }
            catch (e) {
                setSelected(localStorage.getItem('printer_mac') || null);
            }
            refresh();
        })();
        const id = setInterval(() => setConnected(NativePrinter.isConnected()), 2000);
        return () => clearInterval(id);
    }, []);
    const handleConnect = async (id: string) => {
        log('Connecting ' + id + '...');
        const res = await NativePrinter.connect(id);
        if (res && res.ok) {
            setConnected(true);
            setSelected(id);
            try {
                await secureStorage.setItem('printer_mac', id);
            }
            catch (e) { }
            try {
                localStorage.setItem('printer_mac', id);
            }
            catch (e) { }
            toast.success('Connecté');
            log('Connected ' + id);
        }
        else {
            const msg = res && res.error ? String(res.error) : 'Connexion échouée';
            toast.error(`Connexion échouée: ${msg}`);
            log('Connect failed: ' + msg);
        }
    };
    const handleDisconnect = async () => {
        const ok = await NativePrinter.disconnect();
        setConnected(!ok ? false : false);
        toast.info('Déconnecté');
        log('Disconnected');
    };
    const handlePrint = async () => {
        const html = `<div style="font-family:monospace; white-space:pre">${(text || '').replace(/</g, '&lt;')}</div>`;
        const deviceId = selected || undefined;
        log('Printing to ' + (deviceId || 'default') + '...');
        const ok = await NativePrinter.printHtml(html, deviceId as any);
        if (ok) {
            toast.success('Impression envoyée');
            log('Print success');
        }
        else {
            toast.error('Échec de l\'impression');
            log('Print failed');
        }
    };
    return (<div className="w-full p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Debug Imprimante</h1>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Contrôles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Button onClick={refresh} disabled={loading}>{loading ? 'Recherche...' : 'Rechercher appareils appairés'}</Button>
              <Button variant="outline" onClick={() => {
            const info = NativePrinter.inspectPlugin();
            log('Plugin info: ' + JSON.stringify(info));
            toast.success('Plugin info affichée dans les logs');
        }}>Inspecter plugin</Button>
              <Button variant="outline" onClick={async () => {
            log('Probing devices...');
            for (const d of paired) {
                const p = await NativePrinter.probeDevice(d.id, 3000);
                log(`${d.name} (${d.id}) available=${p.available} ${p.error ? ' error=' + p.error : ''}`);
            }
            toast.success('Probe terminé (voir logs)');
        }}>Vérifier disponibilité</Button>
              <Button onClick={async () => { const s = await secureStorage.getItem('printer_mac'); setSelected(s || localStorage.getItem('printer_mac') || null); toast.success('Selection rechargée'); }}>Charger sélection</Button>
              <Button variant="outline" onClick={async () => { await handleDisconnect(); }}>Déconnecter</Button>
            </div>

            <div className="space-y-2">
              {paired.length === 0 ? (<div className="text-sm text-muted-foreground">Aucun appareil appairé trouvé.</div>) : (paired.map(d => (<div key={d.id} className={`p-2 border rounded flex items-center justify-between ${selected === d.id ? 'bg-muted' : ''}`}>
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant={selected === d.id ? 'secondary' : 'ghost'} onClick={async () => { setSelected(d.id); try {
            await secureStorage.setItem('printer_mac', d.id);
        }
        catch (e) { } try {
            localStorage.setItem('printer_mac', d.id);
        }
        catch (e) { } toast.success('Imprimante sélectionnée'); }}>Sélectionner</Button>
                      <Button size="sm" onClick={() => handleConnect(d.id)}>Se connecter</Button>
                    </div>
                  </div>)))}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Envoyer texte</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full p-2 border rounded"/>
            <div className="mt-3 flex gap-2">
              <Button onClick={handlePrint}>Imprimer le texte (natif)</Button>
              <Button variant="ghost" onClick={() => { setText('TEST\nHello thermal printer\n'); }}>Réinitialiser</Button>
            </div>
            <div className="text-sm text-muted-foreground mt-2">Statut: {connected ? 'Connecté' : 'Déconnecté'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logs récents</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {logs.length === 0 ? <div className="text-sm text-muted-foreground">Aucun log</div> : (<ul className="text-xs list-disc pl-4">
                  {logs.map((l, i) => <li key={i}>{l}</li>)}
                </ul>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
}
