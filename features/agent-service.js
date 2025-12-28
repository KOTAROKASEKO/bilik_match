// bilikmatch_web/agent-service.js

// --- Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, setDoc, getDocs, 
    addDoc, updateDoc, deleteDoc, query, where, orderBy, 
    serverTimestamp, runTransaction, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signOut as firebaseSignOut,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import algoliasearch from "https://cdn.jsdelivr.net/npm/algoliasearch@4.22.1/dist/algoliasearch-lite.esm.browser.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// --- Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBCCxQ0AYTHy6A6DrfW7ylYxjGW6AZA1OQ",
  authDomain: "whatsappclone-5ad8f.firebaseapp.com",
  projectId: "whatsappclone-5ad8f",
  storageBucket: "whatsappclone-5ad8f.firebasestorage.app",
  messagingSenderId: "1049878222012",
  appId: "1:1049878222012:web:54584a8098728e70acecb9"
};

const ALGOLIA_APP_ID = 'Z37M8J0YOF';
const ALGOLIA_SEARCH_KEY = 'f53032958b1e5ade080d0ae5a5d14332';
const ALGOLIA_INDEX_NAME = 'tenant_index';

// --- Initialize ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
const tenantIndex = algoliaClient.initIndex(ALGOLIA_INDEX_NAME);
const functions = getFunctions(app, 'us-central1'); // Check if your function region is 'us-central1'

// --- Auth Functions ---

export function onUserChanged(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}

// Google Login
export async function signInWithGoogle() {
    console.log("🔵 Google Sign-In...");
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        await _ensureAgentProfile(user); // プロフィール作成確認
        return user;
    } catch (error) {
        console.error("❌ Google Sign-In Error:", error);
        throw error;
    }
}

// Email Sign Up
export async function signUpWithEmail(email, password, name) {
    console.log("🔵 Email Sign-Up...");
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        // プロフィール作成
        await _createAgentProfile(user, name);
        return user;
    } catch (error) {
        console.error("❌ Sign-Up Error:", error);
        throw error;
    }
}

// Email Sign In
export async function signInWithEmail(email, password) {
    console.log("🔵 Email Sign-In...");
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
    } catch (error) {
        console.error("❌ Sign-In Error:", error);
        throw error;
    }
}

// Logout
export async function logoutAgent() {
    try {
        await firebaseSignOut(auth);
        console.log("✅ Logged out");
        window.location.href = 'tenant_list_view.html';
    } catch (error) {
        console.error("❌ Logout Error:", error);
    }
}

// Helper: Create Profile
async function _createAgentProfile(user, displayName) {
    const docRef = doc(db, "users_prof", user.uid);
    await setDoc(docRef, {
        email: user.email,
        displayName: displayName || 'Agent',
        profileImageUrl: user.photoURL || '', // Email登録時は空になることが多い
        bio: "Hello! I am a new agent on Bilikmatch.",
        phoneNumber: "",
        role: "agent",
        createdAt: serverTimestamp()
    });
    console.log("📝 Profile created!");
}

// Helper: Ensure Profile Exists (for Google Login)
async function _ensureAgentProfile(user) {
    const docRef = doc(db, "users_prof", user.uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        await _createAgentProfile(user, user.displayName);
    }
}

// --- Agent Profile Repository ---

export async function fetchAgentPosts(userId) {
    console.log(`📡 Fetching listings for UID: ${userId}`);
    try {
        const q = query(
            collection(db, "posts"),
            where("userId", "==", userId),
            orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);
        const posts = querySnapshot.docs.map(doc => {
            const data = doc.data();
            
            // ★ Prepare _geoloc from Firestore Geopoint
            // (Mapping Firestore data to the structure you requested)
            let _geoloc = null;
            if (data.position && data.position.geopoint) {
                _geoloc = {
                    lat: data.position.geopoint.latitude,
                    lng: data.position.geopoint.longitude // Algolia uses 'lng' standard
                };
            }

            return {
                id: doc.id,
                title: data.condominiumName || 'Untitled Property',
                rent: data.rent || 0,
                location: data.location || '',
                imageUrl: (data.imageUrls && data.imageUrls.length > 0) ? data.imageUrls[0] : 'https://via.placeholder.com/300x180',
                likes: data.likeCount || 0,
                description: data.description || '',
                area: data.location || '',
                gender: data.gender || 'Mix',
                roomType: data.roomType || 'Middle',
                condominiumName: data.condominiumName || '',
                // ★ ADDED: Return as _geoloc
                _geoloc: _geoloc
            };
        });
        console.log(`📦 Found ${posts.length} listings`);
        return posts;
    } catch (error) {
        console.error("❌ Error fetching posts:", error);
        return [];
    }
}

export async function createPost(postData) {
    console.log("🏗️ Creating new post...");
    if (!currentUser) throw new Error("User not logged in");

    try {
        const userProfile = await fetchAgentProfile(currentUser.uid);
        const newPost = {
            userId: currentUser.uid,
            username: userProfile.displayName,
            userProfileImageUrl: userProfile.profileImageUrl,
            phoneNumber: userProfile.phoneNumber,
            condominiumName: postData.title,
            condominiumName_searchKey: postData.title.toLowerCase().replace(/\s/g, ''),
            rent: parseFloat(postData.rent),
            location: postData.area,
            description: postData.description,
            securityDeposit: 2.0,
            utilityDeposit: 0.5,
            imageUrls: [],
            timestamp: serverTimestamp(),
            likeCount: 0,
            likedBy: [],
            manualTags: [],
            status: 'open',
            reportedBy: [],
            gender: 'Mix',
            roomType: 'Middle'
        };

        const docRef = await addDoc(collection(db, "posts"), newPost);
        console.log(`✅ Post created with ID: ${docRef.id}`);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error creating post:", error);
        throw error;
    }
}

export async function deletePost(postId) {
    console.log(`🗑️ Deleting post ID: ${postId}`);
    try {
        await deleteDoc(doc(db, "posts", postId));
        console.log("✅ Post deleted successfully");
    } catch (error) {
        console.error("❌ Error deleting post:", error);
        throw error;
    }
}

export async function updatePost(postId, updates) {
    console.log(`Update Attempt: ID ${postId}`, updates);
    try {
        const docRef = doc(db, "posts", postId);
        await updateDoc(docRef, updates);
        console.log("✅ Post updated successfully");
    } catch (error) {
        console.error("❌ Error updating post:", error);
        throw error;
    }
}

// --- Algolia Tenant Search ---

export async function searchTenants(propertyFilter) {
    console.log("🔍 Starting Algolia Search with filters:", propertyFilter);
    
    // --- Facet Filters (Rent & Gender) ---
    let filters = ['role:tenant'];
    
    // 1. Filter by Rent (Budget)
    if (propertyFilter.rent && propertyFilter.rent > 0) {
        filters.push(`budget >= ${propertyFilter.rent}`);
    }
    
    // 2. Filter by Gender
    if (propertyFilter.gender && propertyFilter.gender !== 'Mix') {
        filters.push(`(gender:${propertyFilter.gender} OR gender:Mix)`);
    }

    const filterString = filters.join(' AND ');

    // --- Algolia Options ---
    let algoliaOptions = {
        filters: filterString,
        hitsPerPage: 20
    };

    // --- Location Logic ---
    let queryStr = "";
    
    // ★ Use _geoloc from Property Listing
    if (propertyFilter._geoloc) {
        const { lat, lng } = propertyFilter._geoloc;
        // Also handle 'long' if your custom data uses it, but standard is 'lng'
        const longitude = lng || propertyFilter._geoloc.long; 
        
        algoliaOptions.aroundLatLng = `${lat}, ${longitude}`;
        algoliaOptions.aroundRadius = 20000; // 20km radius
        console.log(`✅ Using Property Geolocation: ${lat}, ${longitude}`);
    } 
    // Fallback: Geocode text query
    else if (propertyFilter.query && propertyFilter.query.trim().length > 0) {
        console.log(`🗺️ Geocoding location: ${propertyFilter.query}`);
        const coords = await getCoordinates(propertyFilter.query); // Existing helper
        
        if (coords) {
            algoliaOptions.aroundLatLng = `${coords.lat}, ${coords.lng}`;
            algoliaOptions.aroundRadius = 20000;
            console.log("✅ Using Geo-Search (from text)");
        } else {
            console.log("⚠️ Geocoding failed, using text match");
            queryStr = propertyFilter.query;
        }
    }

    // --- Execute Search ---
    console.log(`🛰️ Sending to Algolia...`, { query: queryStr, options: algoliaOptions });

    try {
        const result = await tenantIndex.search(queryStr, algoliaOptions);
        
        // Map results (same as before)
        return result.hits.map(hit => ({
            id: hit.objectID,
            name: hit.displayName || 'Unknown',
            occupation: hit.occupation || 'Job not specified',
            budget: hit.budget || 0,
            area: hit.location || (hit.preferredAreas && hit.preferredAreas[0]) || 'Flexible',
            match: calculateMatchScore(hit, propertyFilter),
            bio: hit.selfIntroduction || '',
            date: hit.moveinDate ? new Date(hit.moveinDate * 1000).toLocaleDateString() : 'ASAP',
            avatar: hit.profileImageUrl || `https://ui-avatars.com/api/?name=${hit.displayName}&background=random`
        }));
    } catch (error) {
        console.error("❌ Algolia Search Error:", error);
        return [];
    }
}

function calculateMatchScore(tenant, property) {
    let score = 70;
    if (tenant.budget >= property.rent * 1.2) score += 10;
    if (tenant.location === property.area) score += 15;
    if (tenant.roomType === property.roomType) score += 5;
    const finalScore = Math.min(score, 99);
    return finalScore;
}

async function getCoordinates(address) {
    if (!address) return null;
    const geocodeFunc = httpsCallable(functions, 'geocode');
    try {
        const result = await geocodeFunc({ address: address });
        if (result.data.lat && result.data.lng) {
            console.log(`📍 Geocoded "${address}" to:`, result.data);
            return result.data; // { lat, lng }
        }
    } catch (error) {
        console.error("Geocoding Cloud Function Error:", error);
    }
    return null;
}

export async function startChat(otherUserId, otherUserName, otherUserPhoto) {
    const user = auth.currentUser;
    if (!user) {
        alert("Please login first");
        return;
    }
    
    // Prevent chatting with self
    if (user.uid === otherUserId) {
        alert("You cannot chat with yourself.");
        return;
    }

    const myUid = user.uid;
    // Generate consistent Thread ID (Alphabetical order of UIDs)
    const uids = [myUid, otherUserId].sort();
    const threadId = uids.join('_');

    console.log(`💬 Starting chat thread: ${threadId}`);

    try {
        const docRef = doc(db, 'chats', threadId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            // Create new thread
            await setDoc(docRef, {
                participants: uids,
                whoSent: myUid,
                whoReceived: otherUserId,
                lastMessage: "Started a conversation",
                timeStamp: serverTimestamp(),
                [`unreadCount_${otherUserId}`]: 1,
                [`unreadCount_${myUid}`]: 0,
            });
        }
        
        // Redirect
        window.location.href = 'chat/chat.html';
    } catch (e) {
        console.error("Error starting chat:", e);
        alert("Failed to start chat. See console.");
    }
}
