import React from 'react';
interface ErrorBoundaryState {
    hasError: boolean;
    error: any;
}
export class ErrorBoundary extends React.Component<{
    children: React.ReactNode;
}, ErrorBoundaryState> {
    constructor(props: {
        children: React.ReactNode;
    }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff', color: '#d32f2f', fontSize: '1.2rem', textAlign: 'center' }}>
          <h1>Une erreur est survenue</h1>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxWidth: '90vw' }}>{this.state.error?.toString() || 'Erreur inconnue'}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '2rem', padding: '0.5rem 1.5rem', fontSize: '1rem' }}>Recharger l'application</button>
        </div>);
        }
        return this.props.children;
    }
}
