import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
export default function PinModal() {
    const { locked, verifyPin } = useAuth() as any;
    const [pin, setPin] = useState('');
    if (!locked)
        return null;
    const submit = async () => {
        if (pin.length < 4)
            return toast.error('PIN incomplet');
        const ok = await verifyPin(pin);
        if (!ok)
            toast.error('PIN incorrect');
    };
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm">
        <h3 className="text-lg font-semibold mb-4">Déverrouiller l'application</h3>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full p-3 border rounded mb-4 text-xl text-center" inputMode="numeric" autoFocus/>
        <div className="flex gap-2">
          <button onClick={submit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded">Valider</button>
        </div>
      </div>
    </div>);
}
