// Instructions de test pour console mobile

// Pour tester l'envoi d'email depuis la console du navigateur mobile :

// 1. Ouvrir la console développeur mobile
// 2. Copier-coller ce code :

console.log('🧪 Test du service email mobile');
console.log('🔍 Détection erreur Service Worker/Channel...');

// Test spécifique pour Android Studio
const testEmailAndroid = async () => {
  console.log('📱 Test spécial Android Studio');
  console.log('🔍 Capacitor présent:', !!(window.Capacitor));
  console.log('🔍 User Agent:', navigator.userAgent);
  
  // Test XMLHttpRequest direct
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://mediumslateblue-cod-399211.hostingersite.com/backend/api/send-email.php?_android_test=1', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;
    
    xhr.onload = function() {
      console.log('✅ XMLHttpRequest Status:', xhr.status);
      console.log('✅ Response:', xhr.responseText);
      resolve(xhr.status === 200);
    };
    
    xhr.onerror = function() {
      console.log('❌ XMLHttpRequest Error');
      resolve(false);
    };
    
    xhr.ontimeout = function() {
      console.log('❌ XMLHttpRequest Timeout');
      resolve(false);
    };
    
    const payload = {
      name: 'Test Android Studio',
      email: 'powerstartbf@gmail.com',
      message: 'Test direct XMLHttpRequest depuis Android Studio',
      storeName: 'Test Android'
    };
    
    xhr.send(JSON.stringify(payload));
  });
};

const detectBackendReachability = async () => {
  try {
    const response = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/health.php?_mobile_test=' + Date.now(), {
      cache: 'no-store'
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// Simuler un test d'envoi d'email
const testEmailMobile = async () => {
  try {
    console.log('📧 Import du service email...');
    
    // Import dynamique du service
    const { emailService } = await import('./src/lib/emailService.js');
    
    const backendReachable = await detectBackendReachability();

    const testPayload = {
      name: 'Test Mobile Console',
      email: 'powerstartbf@gmail.com',
      message: `🧪 Test d'envoi depuis console mobile\n\nDate: ${new Date().toLocaleString()}\nUserAgent: ${navigator.userAgent}\nOnlineHint: ${navigator.onLine}\nBackendReachable: ${backendReachable}\nConnection: ${navigator.connection?.effectiveType || 'unknown'}`,
      storeName: 'Test Console'
    };
    
    console.log('📤 Envoi du test email...');
    const result = await emailService.sendEmail(testPayload);
    
    if (result.ok) {
      console.log('✅ SUCCESS: Email de test envoyé !');
      console.log('🎉 Le service email fonctionne sur mobile !');
    } else {
      console.log('❌ FAILED: Erreur envoi email:', result.error);
    }
    
    // Infos de debug
    console.log('🔍 Debug info:', emailService.getDebugInfo());
    
  } catch (error) {
    console.error('❌ EXCEPTION: Erreur du test:', error);
  }
};

// Lancer les tests complets
const runAllTests = async () => {
  console.log('🚀 Début des tests mobile...');
  
  // Test 1: XMLHttpRequest direct pour Android Studio
  console.log('\n=== TEST 1: XMLHttpRequest Direct ===');
  const androidResult = await testEmailAndroid();
  console.log('🎯 Résultat test Android direct:', androidResult ? '✅ SUCCESS' : '❌ FAILED');
  
  console.log('\n=== TEST 2: Service Email Normal ===');
  // Test 2: Service email normal
  await testEmailMobile();
  
  console.log('\n🏁 Tests terminés!');
};

console.log('🚀 Lancement des tests email mobile...');
runAllTests();
