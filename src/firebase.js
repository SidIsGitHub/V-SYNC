import { initializeApp } from "firebase/compat/app";
import { getFirestore } from "firebase/firestore/lite";

const firebaseConfig = {
  apiKey: "AIzaSyBFivNpSRGK87SDxzi3wWJAl3Pia_vrezo",
  authDomain: "college-mentorship--app.firebaseapp.com",
  projectId: "college-mentorship--app",
  storageBucket: "college-mentorship--app.firebasestorage.app",
  messagingSenderId: "842851012332",
  appId: "1:842851012332:web:37ff1cbf9b7b90977c1fc9",
  measurementId: "G-G6MN80S4LM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);