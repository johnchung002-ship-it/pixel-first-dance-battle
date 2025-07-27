// Import Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBS7aG1UBXzF9DpCwPWJYqO7pB5LvRAJkU",
  authDomain: "choom-choom-reception.firebaseapp.com",
  projectId: "choom-choom-reception",
  storageBucket: "choom-choom-reception.firebasestorage.app",
  messagingSenderId: "119072880697",
  appId: "1:119072880697:web:ce2c69962dfcb2a50fb5e8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

export { db };
