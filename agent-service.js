// bilikmatch_web/agent-service.js

// --- Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, 
    addDoc, updateDoc, deleteDoc, query, where, orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signOut as firebaseSignOut,
    createUserWithEmailAndPassword, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import algoliasearch from "https://cdn.jsdelivr.net/npm/algoliasearch@4.22.1/dist/algoliasearch-lite.esm.browser.js";

// --- Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBCCxQ0AYTHy6A6DrfW7ylYxjGW6AZA1OQ",
  authDomain: "whatsappclone-5ad8f.firebaseapp.com",
  databaseURL: "https://whatsappclone-5ad8f-default-rtdb.firebaseio.com",
  projectId: "whatsappclone-5ad8f",
  storageBucket: "whatsappclone-5ad8f.firebasestorage.app",
  messagingSenderId: "1049878222012",
  appId: "1:1049878222012:web:54584a8098728e70acecb9",
  measurementId: "G-EQ99QMVB2Y"
};

const ALGOLIA_APP_ID = 'Z37M8J0YOF';
const ALGOLIA_SEARCH_KEY = 'f53032958b1e5ade080d0ae5a5d14332';
const ALGOLIA_INDEX_NAME = 'tenant_index';

// --- Initialize Services ---
console.log("🚀 Initializing Firebase and Algolia services...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
const tenantIndex = algoliaClient.initIndex(ALGOLIA_INDEX_NAME);

// --- State Management ---
let currentUser = null;

// --- Auth Functions ---

export function onUserChanged(callback) {
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            console.log(`👤 Auth State: User logged in (${user.uid})`);
        } else {
            console.log("👤 Auth State: No user logged in");
        }
        callback(user);
    });
}

export async function signUpAgent(email, password, name) {
    console.log(`📝 Attempting Sign Up for: ${email}`);
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log("✅ User created in Firebase Auth. Setting up Firestore profile...");
        await setDoc(doc(db, "users_prof", user.uid), {
            email: email,
            displayName: name,
            profileImageUrl: "",
            bio: "Hello! I am a new agent on Bilikmatch.",
            phoneNumber: "",
            role: "agent"
        });
        
        console.log("🎉 Sign Up successful!");
        return user;
    } catch (error) {
        console.error("❌ Sign Up Error:", error.code, error.message);
        throw error;
    }
}

export async function signInAgent(email, password) {
    console.log(`🔑 Attempting Sign In for: ${email}`);
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("✅ Sign In successful!");
        return userCredential.user;
    } catch (error) {
        console.error("❌ Sign In Error:", error.code, error.message);
        throw error;
    }
}

export async function logoutAgent() {
    console.log("🚪 Logging out...");
    try {
        await firebaseSignOut(auth);
        console.log("✅ Logout successful");
        window.location.href = 'tenant_list_view.html'; 
    } catch (error) {
        console.error("❌ Logout Error:", error);
    }
}

// --- Agent Profile Repository ---

export async function fetchAgentProfile(userId) {
    console.log(`📡 Fetching profile for UID: ${userId}`);
    if (!userId) return null;
    try {
        const docRef = doc(db, "users_prof", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("📄 Profile found:", data.displayName);
            return {
                uid: docSnap.id,
                email: data.email || '',
                displayName: data.displayName || 'New user',
                profileImageUrl: data.profileImageUrl || '',
                bio: data.bio || '',
                phoneNumber: data.phoneNumber || ''
            };
        } else {
            console.warn("⚠️ Profile document does not exist in Firestore");
            return null;
        }
    } catch (error) {
        console.error("❌ Error fetching profile:", error);
        throw error;
    }
}

// --- Listings Repository ---

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
                condominiumName: data.condominiumName || ''
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
    
    // 1. Build Filters
    let filters = ['role:tenant'];
    
    // Handle Budget
    if (propertyFilter.rent && propertyFilter.rent > 0) {
        filters.push(`budget >= ${propertyFilter.rent}`);
    }
    
    // Handle Gender (if passed)
    if (propertyFilter.gender && propertyFilter.gender !== 'Mix') {
        filters.push(`(gender:${propertyFilter.gender} OR gender:Mix)`);
    }

    const filterString = filters.join(' AND ');

    // 2. Determine Query String
    // Priority: User typed input > Selected Area > Empty
    // Note: If you want to filter strictly by area, add it to filters instead: `location:${propertyFilter.area}`
    // But for fuzzy search, we put it in the query.
    let queryParts = [];
    if (propertyFilter.query) queryParts.push(propertyFilter.query);
    if (propertyFilter.area) queryParts.push(propertyFilter.area);
    
    const queryStr = queryParts.join(' ');
    
    console.log(`🛰️ Algolia Request -> Query: "${queryStr}", Filters: "${filterString}"`);

    try {
        const result = await tenantIndex.search(queryStr, {
            filters: filterString,
            hitsPerPage: 20
        });

        console.log(`📊 Algolia Result -> Found ${result.nbHits} hits`);

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