import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase configuration provided by the user
const firebaseConfig = {
  apiKey: "AIzaSyDJnMbKtiw32iE6g16ysqlQKbVEm1LtXKk",
  authDomain: "hours-3d4da.firebaseapp.com",
  projectId: "hours-3d4da",
  storageBucket: "hours-3d4da.firebasestorage.app",
  messagingSenderId: "827347205935",
  appId: "1:827347205935:web:7c0dbc8bd5399d0de06bda"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore (simplified without persistent cache)
const db = getFirestore(app);

const auth = getAuth(app);

export { db, auth };
