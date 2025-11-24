import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { buildReceiptHtml, tryNativePrint } from '@/lib/print';
import * as NativePrinter from '@/lib/nativePrinter';

export default function ShiftReceiptDetails({ selectedShift, cashiers }: { selectedShift: any, cashiers: any[] }) {
  const [storeName, setStoreName] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    async function fetchStoreName() {
      if (!selectedShift?.storeId) return setStoreName('');
      try {
        const db = await import('@/lib/db').then(m => m.getDB());
        const store = await db.get('stores', selectedShift.storeId);
        if (isMounted) setStoreName(store?.name || selectedShift.storeId || '-');
      } catch {
        setStoreName(selectedShift.storeId || '-');
      }
    }
    fetchStoreName();
    return () => { isMounted = false; };
  }, [selectedShift]);
  const [paymentSummary, setPaymentSummary] = useState<{ cash: number, mobile_money: number } | null>(null);
  const [refundsSummary, setRefundsSummary] = useState<{ cash: number, mobile_money: number } | null>(null);
  const [cashierName, setCashierName] = useState<string>('-');
  const [computedExpected, setComputedExpected] = useState<number | null>(null);
  const [computedDifference, setComputedDifference] = useState<number | null>(null);
  const [computedSalesTotal, setComputedSalesTotal] = useState<number | null>(null);

  const formatMoney = (v: number | null | undefined) => {
    if (v === null || v === undefined || isNaN(Number(v))) return '-';
    // Intl.NumberFormat may use non-breaking spaces (U+00A0) or narrow no-break spaces (U+202F).
    // Replace them with normal spaces so ESC/POS encoding doesn't produce '?'.
    return new Intl.NumberFormat('fr-FR').format(Math.round(Number(v))).replace(/\u00A0|\u202F/g, ' ');
  };

  useEffect(() => {
    let isMounted = true;
    async function fetchPayments() {
      if (!selectedShift) return;
      try {
        const db = await import('@/lib/db').then(m => m.getDB());
        const sales = await db.getAllFromIndex('sales', 'by-shift', selectedShift.id);
        // helper to coerce values to numbers and avoid NaN
        // Accepts numbers or strings like "5 000", "5,000", "5000.00" and strips non-numeric separators
        const toNum = (v: any) => {
          if (v === null || v === undefined) return 0;
          if (typeof v === 'number' && !isNaN(v)) return v;
          let s = String(v);
          // remove common thousands separators and non-numeric chars except dot and minus
          s = s.replace(/\u00A0|\u202F/g, ''); // NBSP
          s = s.replace(/\s+/g, '');
          s = s.replace(/,/g, '.');
          s = s.replace(/[^0-9.\-]/g, '');
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        };

        // Utiliser les montants saisis lors de la fermeture du shift au lieu de calculer à partir des ventes
        let cash = 0, mobile_money = 0;
        
        // Priorité aux montants saisis lors de la fermeture du shift
        if (selectedShift.cashAmount !== undefined || selectedShift.mobileMoneyAmount !== undefined) {
          cash = toNum(selectedShift.cashAmount || 0);
          mobile_money = toNum(selectedShift.mobileMoneyAmount || 0);
        } else {
          // Fallback: calculer à partir des ventes (ancien comportement)
          for (const sale of sales) {
            // Vérifier si la vente est remboursée
            const isRefunded = Boolean(sale.refunded);
            if (isRefunded) continue; // Ignorer les ventes remboursées
            
            let saleCash = 0, saleMobile = 0;
            
            // Priorité aux champs directs cashAmount et mobileMoneyAmount
            if (sale.cashAmount !== undefined || sale.mobileMoneyAmount !== undefined) {
              saleCash = toNum(sale.cashAmount || 0);
              saleMobile = toNum(sale.mobileMoneyAmount || 0);
            } else if (sale.payments && Array.isArray(sale.payments)) {
              // Fallback: utiliser le tableau payments
              for (const p of sale.payments) {
                if (p.method === 'cash') saleCash += toNum(p.amount);
                if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
              }
            } else {
              // Dernière fallback: utiliser paymentMethod et total (ancienne logique)
              if (sale.paymentMethod === 'cash') saleCash = toNum(sale.total);
              if (sale.paymentMethod === 'mobile_money') saleMobile = toNum(sale.total);
            }
            
            cash += saleCash;
            mobile_money += saleMobile;
          }
        }

        // Calculer les remboursements séparément pour affichage
        let refundsCash = 0, refundsMobile = 0;
        let salesTotal = 0;
        
        for (const sale of sales) {
          // Vérifier si la vente est remboursée
          const isRefunded = Boolean(sale.refunded);
          
          // sum totals for expected calculation (ignorer les ventes remboursées)
          if (!isRefunded) {
            const saleTotal = (typeof sale.total === 'number' && !isNaN(sale.total)) ? Number(sale.total) : (Number(sale.total) || 0);
            salesTotal += saleTotal;
          } else {
            // Pour les remboursements, calculer les montants par mode de paiement
            let saleCash = 0, saleMobile = 0;
            
            if (sale.cashAmount !== undefined || sale.mobileMoneyAmount !== undefined) {
              saleCash = toNum(sale.cashAmount || 0);
              saleMobile = toNum(sale.mobileMoneyAmount || 0);
            } else if (sale.payments && Array.isArray(sale.payments)) {
              for (const p of sale.payments) {
                if (p.method === 'cash') saleCash += toNum(p.amount);
                if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
              }
            } else {
              if (sale.paymentMethod === 'cash') saleCash = toNum(sale.total);
              if (sale.paymentMethod === 'mobile_money') saleMobile = toNum(sale.total);
            }
            
            refundsCash += saleCash;
            refundsMobile += saleMobile;
          }
        }

        // compute expected: opening + salesTotal (sans les dépenses)
        const opening = selectedShift.openingAmount ? Number(selectedShift.openingAmount) : 0;
        const expected = opening + salesTotal; // Pas de déduction des dépenses

        // compute totalPaid from payments
        const totalPaid = cash + mobile_money;

        // compute difference: if closed use closingAmount - expected, else use totalPaid - expected
        let difference: number | null = null;
        if (selectedShift.closingAmount !== null && selectedShift.closingAmount !== undefined) {
          difference = Number(selectedShift.closingAmount) - expected;
        } else {
          difference = totalPaid - expected;
        }

        if (isMounted) {
          setPaymentSummary({ cash, mobile_money });
          setRefundsSummary({ cash: refundsCash, mobile_money: refundsMobile });
          setComputedExpected(Number.isFinite(expected) ? expected : null);
          setComputedDifference(Number.isFinite(difference) ? difference : null);
          setComputedSalesTotal(Number.isFinite(salesTotal) ? salesTotal : null);
        }
      } catch (e) {
        setPaymentSummary(null);
        setRefundsSummary(null);
        setComputedExpected(null);
        setComputedDifference(null);
        setComputedSalesTotal(null);
      }
    }
    fetchPayments();
    return () => { isMounted = false; };
  }, [selectedShift]);

  // Resolve cashier name: try prop array first, then fallback to DB lookup
  useEffect(() => {
    let isMounted = true;
    async function resolveCashier() {
      if (!selectedShift) return setCashierName('-');
      try {
        // try prop array with flexible id compare
        const found = cashiers.find(u => String(u.id) === String(selectedShift.userId));
        if (found && found.username) {
          if (isMounted) setCashierName(found.username);
          return;
        }
        // fallback to DB
        const db = await import('@/lib/db').then(m => m.getDB());
        const user = await db.get('users', selectedShift.userId);
        if (isMounted) setCashierName(user?.username || '-');
      } catch (e) {
        if (isMounted) setCashierName('-');
      }
    }
    resolveCashier();
    return () => { isMounted = false; };
  }, [selectedShift, cashiers]);

  return (
    <div
      id="shift-receipt-print"
      className="font-mono text-xs p-2 border rounded bg-white"
      style={{
        width: '100%',
        maxWidth: '260px', // largeur réduite pour reçu plus long
        minHeight: '480px', // hauteur augmentée
        margin: '0 auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>Rapport Service</div>
      <div style={{ marginBottom: 8 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Magasin :</span> <b>{storeName}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ouverture :</span> <b>{new Date(selectedShift.openedAt).toLocaleString('fr-FR')}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fermeture :</span> <b>{selectedShift.closedAt ? new Date(selectedShift.closedAt).toLocaleString('fr-FR') : '-'}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Caissier :</span>
          <b>{cashierName}</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Statut :</span> <b>{selectedShift.status === 'open' ? 'Ouvert' : 'Fermé'}</b></div>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
      <div style={{ marginBottom: 8 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Montant d'ouverture :</span> <b>{formatMoney(selectedShift.openingAmount)} FCFA</b></div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Montant de fermeture :</span> <b>{selectedShift.closingAmount !== null ? formatMoney(selectedShift.closingAmount) : '-'} FCFA</b></div>
  
  {/* Afficher les remboursements s'il y en a */}
  {refundsSummary && (refundsSummary.cash > 0 || refundsSummary.mobile_money > 0) && (
    <div style={{ marginTop: 8, padding: '4px 0', borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }}>Remboursements</div>
      {refundsSummary.cash > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>  Espèces :</span> <b>{formatMoney(refundsSummary.cash)} FCFA</b></div>
      )}
      {refundsSummary.mobile_money > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>  Mobile Money :</span> <b>{formatMoney(refundsSummary.mobile_money)} FCFA</b></div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #ccc' }}>
        <span>  Total remboursé :</span> 
        <b>{formatMoney((refundsSummary.cash || 0) + (refundsSummary.mobile_money || 0))} FCFA</b>
      </div>
    </div>
  )}
  
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Montant attendu :</span> <b>{computedExpected !== null ? formatMoney(computedExpected) : '-'} FCFA</b></div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Écart :</span> <b>{computedDifference !== null ? (computedDifference >= 0 ? '+' : '') + formatMoney(computedDifference) : '-'} FCFA</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Durée :</span> <b>{(() => { const duration = (selectedShift.closedAt || Date.now()) - selectedShift.openedAt; const h = Math.floor(duration / (1000*60*60)); const m = Math.floor((duration % (1000*60*60)) / (1000*60)); return `${h}h ${m}min`; })()}</b></div>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
      <div style={{ marginBottom: 8 }}>
  <div style={{ fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }}>Montant encaissé par mode de paiement</div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Espèces :</span> <b>{paymentSummary ? `${formatMoney(paymentSummary.cash)} FCFA` : '...' }</b></div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mobile Money :</span> <b>{paymentSummary ? `${formatMoney(paymentSummary.mobile_money)} FCFA` : '...' }</b></div>
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, borderTop: '1px dashed #000', paddingTop: 6 }}><span>Total encaissé :</span> <b>{paymentSummary ? `${formatMoney((paymentSummary.cash || 0) + (paymentSummary.mobile_money || 0))} FCFA` : '...' }</b></div>
      </div>
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <Button variant="outline" onClick={async () => {
          // Recompute expected and difference just before printing to ensure up-to-date values
          let expected = 0;
          let difference = 0;
          let salesTotal = 0;
          let cash = 0, mobile_money = 0;
          let refundsCash = 0, refundsMobile = 0;
          if (selectedShift) {
            const db = await import('@/lib/db').then(m => m.getDB());
            const sales = await db.getAllFromIndex('sales', 'by-shift', selectedShift.id);
            const toNum = (v: any) => {
              if (v === null || v === undefined) return 0;
              if (typeof v === 'number' && !isNaN(v)) return v;
              let s = String(v);
              s = s.replace(/\u00A0|\u202F/g, '');
              s = s.replace(/\s+/g, '');
              s = s.replace(/,/g, '.');
              s = s.replace(/[^0-9.\-]/g, '');
              const n = Number(s);
              return Number.isFinite(n) ? n : 0;
            };
            
            // Utiliser les montants saisis lors de la fermeture du shift
            if (selectedShift.cashAmount !== undefined || selectedShift.mobileMoneyAmount !== undefined) {
              cash = toNum(selectedShift.cashAmount || 0);
              mobile_money = toNum(selectedShift.mobileMoneyAmount || 0);
            } else {
              // Fallback: calculer à partir des ventes (ancien comportement)
              for (const sale of sales) {
                const isRefunded = Boolean(sale.refunded);
                if (isRefunded) continue;
                
                let saleCash = 0, saleMobile = 0;
                
                if (sale.cashAmount !== undefined || sale.mobileMoneyAmount !== undefined) {
                  saleCash = toNum(sale.cashAmount || 0);
                  saleMobile = toNum(sale.mobileMoneyAmount || 0);
                } else if (sale.payments && Array.isArray(sale.payments)) {
                  for (const p of sale.payments) {
                    if (p.method === 'cash') saleCash += toNum(p.amount);
                    if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
                  }
                } else {
                  if (sale.paymentMethod === 'cash') saleCash = toNum(sale.total);
                  if (sale.paymentMethod === 'mobile_money') saleMobile = toNum(sale.total);
                }
                
                cash += saleCash;
                mobile_money += saleMobile;
              }
            }

            // Calculer les remboursements et le total des ventes
            let refundsCash = 0, refundsMobile = 0;
            
            for (const sale of sales) {
              const isRefunded = Boolean(sale.refunded);
              
              if (!isRefunded) {
                const saleTotal = (typeof sale.total === 'number' && !isNaN(sale.total)) ? Number(sale.total) : (Number(sale.total) || 0);
                salesTotal += saleTotal;
              } else {
                // Pour les remboursements
                let saleCash = 0, saleMobile = 0;
                
                if (sale.cashAmount !== undefined || sale.mobileMoneyAmount !== undefined) {
                  saleCash = toNum(sale.cashAmount || 0);
                  saleMobile = toNum(sale.mobileMoneyAmount || 0);
                } else if (sale.payments && Array.isArray(sale.payments)) {
                  for (const p of sale.payments) {
                    if (p.method === 'cash') saleCash += toNum(p.amount);
                    if (p.method === 'mobile_money') saleMobile += toNum(p.amount);
                  }
                } else {
                  if (sale.paymentMethod === 'cash') saleCash = toNum(sale.total);
                  if (sale.paymentMethod === 'mobile_money') saleMobile = toNum(sale.total);
                }
                
                refundsCash += saleCash;
                refundsMobile += saleMobile;
              }
            }
            const opening = selectedShift.openingAmount ? Number(selectedShift.openingAmount) : 0;
            expected = opening + salesTotal; // Pas de déduction des dépenses
            const totalPaid = cash + mobile_money;
            if (selectedShift.closingAmount !== null && selectedShift.closingAmount !== undefined) {
              difference = Number(selectedShift.closingAmount) - expected;
            } else {
              difference = totalPaid - expected;
            }
          }
          const printContent = document.getElementById('shift-receipt-print');
          if (!printContent) return;
          const html = buildReceiptHtml(printContent, 'Rapport service');
          try {
            // Try native ESC/POS: build plain-text representation directly from data
            const savedLogo = localStorage.getItem('storeLogo');
            if (savedLogo) {
              try {
                const paper = localStorage.getItem('printer_paper') || '80';
                await NativePrinter.printImage(savedLogo, undefined, paper === '58' ? '58' : '80');
              } catch (e) {
                console.warn('Logo print failed, continuing', e);
              }
            }

            const lines: string[] = [];
            const paper = localStorage.getItem('printer_paper') || '80';
            const width = paper === '58' ? 32 : 48;

            const sanitizeForPrinter = (input: any) => {
              if (input === null || input === undefined) return '';
              let s = String(input);
              s = s.replace(/\u00A0|\u202F/g, ' ');
              s = s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
              try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
              s = s.replace(/[^\x00-\x7F]/g, '');
              s = s.replace(/\s+/g, ' ').trim();
              return s;
            };

            const header = sanitizeForPrinter(storeName || document.title || 'Rapport service');
            const headerLine = NativePrinter.formatColumns(header, '', width);
            lines.push('\x1bE\x01' + headerLine + '\x1bE\x00');
            const opened = selectedShift?.openedAt ? new Date(selectedShift.openedAt).toLocaleString('fr-FR') : '-';
            const closed = selectedShift?.closedAt ? new Date(selectedShift.closedAt).toLocaleString('fr-FR') : '-';
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Ouverture'), sanitizeForPrinter(opened), width));
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Fermeture'), sanitizeForPrinter(closed), width));
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Caissier'), sanitizeForPrinter(cashierName || '-'), width));
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Statut'), sanitizeForPrinter(selectedShift?.status === 'open' ? 'Ouvert' : 'Fermé'), width));
            lines.push('--------------------------------');

            lines.push(NativePrinter.formatColumns(sanitizeForPrinter("Montant d'ouverture"), sanitizeForPrinter(formatMoney(selectedShift?.openingAmount) + ' FCFA'), width));
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Montant de fermeture'), sanitizeForPrinter((selectedShift?.closingAmount !== null && selectedShift?.closingAmount !== undefined) ? (formatMoney(selectedShift.closingAmount) + ' FCFA') : '-'), width));
            
            // Afficher les remboursements s'il y en a
            const totalRefunds = refundsCash + refundsMobile;
            if (totalRefunds > 0) {
              lines.push('');
              lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Remboursements'), '', width));
              if (refundsCash > 0) {
                lines.push(NativePrinter.formatColumns(sanitizeForPrinter('  Espèces'), sanitizeForPrinter(formatMoney(refundsCash) + ' FCFA'), width));
              }
              if (refundsMobile > 0) {
                lines.push(NativePrinter.formatColumns(sanitizeForPrinter('  Mobile Money'), sanitizeForPrinter(formatMoney(refundsMobile) + ' FCFA'), width));
              }
              lines.push(NativePrinter.formatColumns(sanitizeForPrinter('  Total remboursé'), sanitizeForPrinter(formatMoney(totalRefunds) + ' FCFA'), width));
            }
            
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Montant attendu'), sanitizeForPrinter(formatMoney(expected) + ' FCFA'), width));
            const diff = ((difference >= 0 ? '+' : '') + formatMoney(difference) + ' FCFA');
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Écart'), sanitizeForPrinter(diff), width));
            const durationMs = ((selectedShift?.closedAt || Date.now()) - (selectedShift?.openedAt || Date.now()));
            const h = Math.floor(durationMs / (1000*60*60));
            const m = Math.floor((durationMs % (1000*60*60)) / (1000*60));
            lines.push(NativePrinter.formatColumns('Temps d\'activité', `${h}h ${m}min`, width));
            lines.push('--------------------------------');

            const paymentsTitle = NativePrinter.formatColumns(sanitizeForPrinter('Montant encaissé'), '', width);
            lines.push('\x1bE\x01' + paymentsTitle + '\x1bE\x00');
            const cashAmt = formatMoney(cash);
            const mmAmt = formatMoney(mobile_money);
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Espèces'), sanitizeForPrinter(cashAmt + ' FCFA'), width));
            lines.push(NativePrinter.formatColumns(sanitizeForPrinter('Mobile Money'), sanitizeForPrinter(mmAmt + ' FCFA'), width));
            const totalPaid = formatMoney(cash + mobile_money);
            const totalLine = NativePrinter.formatColumns(sanitizeForPrinter('Total encaissé'), sanitizeForPrinter(totalPaid + ' FCFA'), width);
            lines.push('\x1bE\x01' + totalLine + '\x1bE\x00');

            const printed = await NativePrinter.printText(lines);
            if (!printed) {
              const used = await tryNativePrint(html, 'Rapport-shift');
              if (!used) alert('Impossible d\'imprimer: imprimante thermique native non disponible. Veuillez associer une imprimante Bluetooth.');
            }
          } catch (e) {
            console.warn('Print failed, falling back to tryNativePrint', e);
            const used = await tryNativePrint(html, 'Rapport-shift');
            if (!used) alert('Impossible d\'imprimer: imprimante thermique native non disponible. Veuillez associer une imprimante Bluetooth.');
          }
        }}>Imprimer le reçu</Button>
      </div>
      <style>{`
        @media (max-width: 600px) {
          #shift-receipt-print {
            max-width: 98vw !important;
            min-height: 380px !important;
            font-size: 13px !important;
            padding: 4vw !important;
          }
        }
      `}</style>
    </div>
  );
}