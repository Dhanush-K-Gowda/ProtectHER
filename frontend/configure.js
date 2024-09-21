// configure.js
import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCTpXoQGY2ijAxvnrRdujGUT8onAx3Gp7w",
  authDomain: "email-e5e4f.firebaseapp.com",
  projectId: "email-e5e4f",
  storageBucket: "email-e5e4f.appspot.com",
  messagingSenderId: "369866603965",
  appId: "1:369866603965:web:d3978a166b09c15acee6d4",
  databaseURL: "https://email-e5e4f-default-rtdb.firebaseio.com", // Add databaseURL
};

// Initialize Firebase only if it hasn't been initialized yet
let app;
let auth;
let database;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);

  // Initialize Firebase Auth with AsyncStorage persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });

  // Initialize Realtime Database
  database = getDatabase(app);
} else {
  app = getApps()[0];
  database = getDatabase(app); // Initialize Realtime Database in case the app is already initialized
}

export { app, auth, database };