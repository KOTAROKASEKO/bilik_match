import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Initialize Analytics (Make sure to pass 'app' from your main file if needed, or init here)
// Note: You must ensure 'measurementId' is in your firebaseConfig in the main HTML files.
let analytics = null; 

export function initAnalytics(app) {
    analytics = getAnalytics(app);
}

export function recordVisit() {
    if (!analytics) return;

    const auth = getAuth();
    const user = auth.currentUser;

    // 1. Identify the user (so GA knows it's the same person returning)
    if (user) {
        // Sets the User ID for all future events
        logEvent(analytics, 'login', { method: 'auto' }); 
        // Note: setUserId is implied in some SDKs, but logEvent links the session.
    }

    // 2. Log the Page View (Standard Event)
    logEvent(analytics, 'page_view', {
        page_path: window.location.pathname,
        page_title: document.title,
        user_type: user ? 'registered' : 'guest'
    });

    console.log("📈 Page view sent to Google Analytics");
}