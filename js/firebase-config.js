// Importeer Firebase via de officiële browser CDN (geen npm nodig)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlEl6budjC1tn72jEFZSKa1tcvN-MVaes",
  authDomain: "verlanglijst-app.firebaseapp.com",
  projectId: "verlanglijst-app",
  storageBucket: "verlanglijst-app.firebasestorage.app",
  messagingSenderId: "868430700182",
  appId: "1:868430700182:web:e20b25529e40c539d6acb7"
};

// Initialiseer Firebase en Firestore
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
