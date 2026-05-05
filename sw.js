/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-3bd5b695'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();

  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "assets/arrow-left-DVdouQVU.js",
    "revision": null
  }, {
    "url": "assets/badge-gcn8kj6W.js",
    "revision": null
  }, {
    "url": "assets/BarChart-D9_jBT7D.js",
    "revision": null
  }, {
    "url": "assets/bell-ring-Cr6hvVe4.js",
    "revision": null
  }, {
    "url": "assets/Categories-BWvtD79L.js",
    "revision": null
  }, {
    "url": "assets/chevron-left-rOSjzLR2.js",
    "revision": null
  }, {
    "url": "assets/CustomerReceipts-D4p155Es.js",
    "revision": null
  }, {
    "url": "assets/Customers-IfFgsHc8.js",
    "revision": null
  }, {
    "url": "assets/DashboardOnlyAdmin-OZRmhF5H.js",
    "revision": null
  }, {
    "url": "assets/Expenses-8FClr8Zg.js",
    "revision": null
  }, {
    "url": "assets/Expenses-B_lNgNLt.css",
    "revision": null
  }, {
    "url": "assets/eye-C88TQL1C.js",
    "revision": null
  }, {
    "url": "assets/fr-Cy33Cw_w.js",
    "revision": null
  }, {
    "url": "assets/generateCategoricalChart-rwhzRKAq.js",
    "revision": null
  }, {
    "url": "assets/history-Ck7kM1he.js",
    "revision": null
  }, {
    "url": "assets/index-D9YqV8n5.css",
    "revision": null
  }, {
    "url": "assets/index-DDwVG9Ao.js",
    "revision": null
  }, {
    "url": "assets/index-Dp9wMntd.js",
    "revision": null
  }, {
    "url": "assets/input-Dw0RQKGl.js",
    "revision": null
  }, {
    "url": "assets/label-CQjEsVQW.js",
    "revision": null
  }, {
    "url": "assets/loader-circle-Cehv7HXs.js",
    "revision": null
  }, {
    "url": "assets/Login-BNx7DfgE.js",
    "revision": null
  }, {
    "url": "assets/NotFound-BD_ou0Al.js",
    "revision": null
  }, {
    "url": "assets/Notifications-BAOpkeDh.js",
    "revision": null
  }, {
    "url": "assets/PieChart-CB17htjf.js",
    "revision": null
  }, {
    "url": "assets/Pin-BuhZIZQU.js",
    "revision": null
  }, {
    "url": "assets/plus-BVjQp1DL.js",
    "revision": null
  }, {
    "url": "assets/POS-CSCKFxNT.js",
    "revision": null
  }, {
    "url": "assets/print-vy-5bkaj.js",
    "revision": null
  }, {
    "url": "assets/printer-UerHqoTu.js",
    "revision": null
  }, {
    "url": "assets/Products-Ba-Bmq92.js",
    "revision": null
  }, {
    "url": "assets/Receipt-C0WKJSqr.js",
    "revision": null
  }, {
    "url": "assets/receipt-text-B-bHCC5k.js",
    "revision": null
  }, {
    "url": "assets/receiptNumber-C84GaaRI.js",
    "revision": null
  }, {
    "url": "assets/Receipts-tH4VGuFd.js",
    "revision": null
  }, {
    "url": "assets/refresh-ccw-CyaBjOSx.js",
    "revision": null
  }, {
    "url": "assets/ResponsiveContainer-B6klT8Ur.js",
    "revision": null
  }, {
    "url": "assets/RoleRedirect-8-ABp5Sd.js",
    "revision": null
  }, {
    "url": "assets/salesSync-eDDT53Li.js",
    "revision": null
  }, {
    "url": "assets/search-Bejvx-bk.js",
    "revision": null
  }, {
    "url": "assets/select-BJHtBVHO.js",
    "revision": null
  }, {
    "url": "assets/Settings-BCFzsi5C.js",
    "revision": null
  }, {
    "url": "assets/settings-DytbpIEi.js",
    "revision": null
  }, {
    "url": "assets/shield-B80AvZ7w.js",
    "revision": null
  }, {
    "url": "assets/Shifts-CyywtDoV.js",
    "revision": null
  }, {
    "url": "assets/square-pen-whwAhcTk.js",
    "revision": null
  }, {
    "url": "assets/StockAdjustmentHistory-CRWnne1w.js",
    "revision": null
  }, {
    "url": "assets/StockSignals-h6pUppYr.js",
    "revision": null
  }, {
    "url": "assets/Stores-D_sCBQEz.js",
    "revision": null
  }, {
    "url": "assets/SubscriptionPayments-K0BYUkBJ.js",
    "revision": null
  }, {
    "url": "assets/switch-BC9fhufy.js",
    "revision": null
  }, {
    "url": "assets/table-2hY09rP1.js",
    "revision": null
  }, {
    "url": "assets/tabs-LYjGWjy5.js",
    "revision": null
  }, {
    "url": "assets/textarea-CMZCMDUK.js",
    "revision": null
  }, {
    "url": "assets/trash-2-D2nf7u4O.js",
    "revision": null
  }, {
    "url": "assets/trending-down-i6yUwXzx.js",
    "revision": null
  }, {
    "url": "assets/trending-up-DCuZrbB_.js",
    "revision": null
  }, {
    "url": "assets/Users-CXKY-BpC.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-BxPaQJAw.js",
    "revision": null
  }, {
    "url": "assets/workbox-window.prod.es5-B9K5rw8f.js",
    "revision": null
  }, {
    "url": "favicon/apple-touch-icon.png",
    "revision": "bdf391ce0f39c8245b44ab485cc5a100"
  }, {
    "url": "favicon/favicon-96x96.png",
    "revision": "f2f0453dfcb30cb50e87f1f89556a47a"
  }, {
    "url": "favicon/favicon.svg",
    "revision": "c4413c13486b9a638c2a3d98add8efc2"
  }, {
    "url": "favicon/icon-128x128.png",
    "revision": "b8d86a73e8c0d33b7163862d5dd1d039"
  }, {
    "url": "favicon/icon-16x16.png",
    "revision": "884a7d13f50d103c6d55523a2f3c7f49"
  }, {
    "url": "favicon/icon-192x192.png",
    "revision": "5faca95786400124dad823057e7bca7a"
  }, {
    "url": "favicon/icon-256x256.png",
    "revision": "8e6dba4d886dd7a68ea1e0946bedd87e"
  }, {
    "url": "favicon/icon-32x32.png",
    "revision": "da2ec5899caf7eb1c4572550a1820625"
  }, {
    "url": "favicon/icon-384x384.png",
    "revision": "f094ca3ca425e0d927feb4096eeb62bc"
  }, {
    "url": "favicon/icon-48x48.png",
    "revision": "84d46450c24a0801a373a50e7cc6ee77"
  }, {
    "url": "favicon/icon-512x512.png",
    "revision": "9f76a0a096475ec2265f996f02c6faf6"
  }, {
    "url": "favicon/icon-64x64.png",
    "revision": "0a4069de4d3bb1c1d4147e0a3a5f13a9"
  }, {
    "url": "favicon/icon-96x96.png",
    "revision": "ebae54b8432f6bc7c255a65653764e1f"
  }, {
    "url": "favicon/logo.svg",
    "revision": "d41d8cd98f00b204e9800998ecf8427e"
  }, {
    "url": "favicon/web-app-manifest-192x192.png",
    "revision": "4d86d4a20cf2eeac58d942976a25e2c4"
  }, {
    "url": "favicon/web-app-manifest-512x512.png",
    "revision": "9c01f677cc3001fa84dd9e6faac2c5c4"
  }, {
    "url": "index.html",
    "revision": "aef53a39b060c28717a32ac1015fb43f"
  }, {
    "url": "offline.html",
    "revision": "893dde22b9df46cfbc4f8746c7bffa32"
  }, {
    "url": "placeholder.svg",
    "revision": "35707bd9960ba5281c72af927b79291f"
  }, {
    "url": "/offline.html",
    "revision": null
  }, {
    "url": "offline.html",
    "revision": "893dde22b9df46cfbc4f8746c7bffa32"
  }, {
    "url": "robots.txt",
    "revision": "f9dff89adf98833e676de2205921996a"
  }, {
    "url": "favicon/site.webmanifest",
    "revision": "9090e674d41e265d5f03c180fe5f6721"
  }, {
    "url": "manifest.webmanifest",
    "revision": "17a25b589e2a98998d3a03e37edb660f"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(({
    url
  }) => {
    return url.pathname.includes("/backend/api/health.php");
  }, new workbox.NetworkOnly(), 'GET');
  workbox.registerRoute(({
    url
  }) => {
    return /\/api\//.test(url.pathname) && !url.pathname.includes("/backend/api/");
  }, new workbox.NetworkFirst({
    "cacheName": "api-cache-v1",
    "networkTimeoutSeconds": 10,
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    }), new workbox.ExpirationPlugin({
      maxEntries: 50,
      maxAgeSeconds: 300
    })]
  }), 'GET');
  workbox.registerRoute(({
    url,
    request
  }) => {
    const isEmailAPI = url.href.includes("send-email.php");
    const isBackendApi = url.pathname.includes("/backend/api/");
    const hasBypass = url.searchParams.has("_bypass_sw");
    return url.hostname === "mediumslateblue-cod-399211.hostingersite.com" && !isEmailAPI && !isBackendApi && !hasBypass;
  }, new workbox.NetworkFirst({
    "cacheName": "external-api-cache",
    "networkTimeoutSeconds": 15,
    plugins: [new workbox.CacheableResponsePlugin({
      statuses: [200]
    })]
  }), 'GET');
  workbox.registerRoute(/\.(?:png|jpg|jpeg|svg|gif|webp)$/, new workbox.CacheFirst({
    "cacheName": "image-cache-v1",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [200]
    })]
  }), 'GET');
  workbox.registerRoute(/\.(?:js|css|woff2?|ttf|eot)$/, new workbox.StaleWhileRevalidate({
    "cacheName": "static-assets-v1",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 604800
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\//, new workbox.StaleWhileRevalidate({
    "cacheName": "google-fonts-stylesheets-v1",
    plugins: []
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\//, new workbox.CacheFirst({
    "cacheName": "google-fonts-webfonts-v1",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 31536000
    })]
  }), 'GET');

}));
