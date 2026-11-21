import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDzE0UebWuZukzakOA5tB6szfxTWRhEzQI",
  authDomain: "ascii-b79b4.firebaseapp.com",
  projectId: "ascii-b79b4",
  storageBucket: "ascii-b79b4.firebasestorage.app",
  messagingSenderId: "828925319531",
  appId: "1:828925319531:web:83b34a21f77774a040542e",
  measurementId: "G-E5KKV8DL3D",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export { app };

export async function initAnalytics() {
  if (typeof window !== "undefined" && (await isSupported())) {
    return getAnalytics(app);
  }
  return null;
}
