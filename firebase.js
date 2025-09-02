// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDerhUButfooDxZ1lzbcA7Pa9UQ1OpACIc",
  authDomain: "cartas-tabla-periodica-b58d4.firebaseapp.com",
  databaseURL: "https://cartas-tabla-periodica-b58d4-default-rtdb.firebaseio.com",
  projectId: "cartas-tabla-periodica-b58d4",
  storageBucket: "cartas-tabla-periodica-b58d4.firebasestorage.app",
  messagingSenderId: "715187283197",
  appId: "1:715187283197:web:403fce28d444ebdb018a94",
  measurementId: "G-EEDKG1HX1V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
