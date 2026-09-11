importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDJnMbKtiw32iE6g16ysqlQKbVEm1LtXKk",
  authDomain: "hours-3d4da.firebaseapp.com",
  projectId: "hours-3d4da",
  storageBucket: "hours-3d4da.firebasestorage.app",
  messagingSenderId: "827347205935",
  appId: "1:827347205935:web:7c0dbc8bd5399d0de06bda"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
