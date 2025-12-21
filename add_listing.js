// --- Firebase Configuration ---
// REPLACE with your actual firebaseConfig from lib/3-shared/firebase_options.dart
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

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// --- Constants & State ---
const kAvailableTags = [
  'Near Train', 'Near Bus Stop', 'Near Supermarket', 'Near Mall',
  'Quiet Area', 'Renovated', 'Pet Friendly', 'High Floor',
  'Student Friendly', 'Luxury', 'Corner Unit', 'City View',
  'Greenery View', 'Low Density', 'Fully Furnished', 'New Unit'
];

let selectedTags = new Set();
let selectedFiles = []; // Stores the actual File objects
let isPosting = false;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTags();
    setupImagePreview();
    setupFormSubmit();
});

// Render Tags
function initTags() {
    const container = document.getElementById('tagsContainer');
    kAvailableTags.forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.textContent = tag;
        chip.onclick = () => toggleTag(tag, chip);
        container.appendChild(chip);
    });
}

function toggleTag(tag, element) {
    if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        element.classList.remove('selected');
    } else {
        selectedTags.add(tag);
        element.classList.add('selected');
    }
}

// --- Image Handling ---
function setupImagePreview() {
    const input = document.getElementById('imageInput');
    input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            selectedFiles.push(file);
            renderImagePreview(file);
        });
        input.value = ''; // Reset to allow re-selecting same file
    });
}

function renderImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const grid = document.getElementById('imagePreviewGrid');
        const uploadBox = grid.querySelector('.upload-box');

        const slot = document.createElement('div');
        slot.className = 'image-slot';
        
        const img = document.createElement('img');
        img.src = e.target.result;
        
        const removeBtn = document.createElement('div');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            // Remove from array (filtering by reference)
            selectedFiles = selectedFiles.filter(f => f !== file);
            slot.remove();
        };

        slot.appendChild(img);
        slot.appendChild(removeBtn);
        
        // Insert before the upload box
        grid.insertBefore(slot, uploadBox);
    };
    reader.readAsDataURL(file);
}

// --- Geocoding Logic ---
// Matches the logic in _geocodeLocation() from ViewModel
async function geocodeAddress(address) {
    if (!address) return null;
    
    // NOTE: In production, ensure you restrict this API key or use a backend proxy.
    const apiKey = "YOUR_GOOGLE_MAPS_API_KEY"; 
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            return {
                lat: loc.lat,
                lng: loc.lng
            };
        } else {
            console.warn("Geocoding failed: " + data.status);
            return null;
        }
    } catch (error) {
        console.error("Geocoding error:", error);
        return null; // Fallback to no location
    }
}

// --- Form Submission ---
function setupFormSubmit() {
    const form = document.getElementById('listingForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = auth.currentUser;
        if (!user) {
            alert("Please sign in first.");
            return;
        }

        if (isPosting) return;
        isPosting = true;
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.textContent = 'Posting...';
        submitBtn.disabled = true;

        try {
            // 1. Prepare Data
            const condoName = document.getElementById('condoName').value;
            const location = document.getElementById('location').value;
            const geoPoint = await geocodeAddress(location);
            
            // Search key logic from Dart: remove spaces, lowercase
            const searchKey = condoName.replace(/\s+/g, '').toLowerCase();

            const postData = {
                userId: user.uid,
                username: user.displayName || 'Agent',
                userProfileImageUrl: user.photoURL || '',
                
                condominiumName: condoName,
                condominiumName_searchKey: searchKey,
                location: location,
                description: document.getElementById('description').value,
                
                rent: parseFloat(document.getElementById('rent').value),
                securityDeposit: parseFloat(document.getElementById('securityDeposit').value),
                utilityDeposit: parseFloat(document.getElementById('utilityDeposit').value),
                
                durationStart: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('availableFrom').value)),
                durationMonths: parseInt(document.getElementById('duration').value),
                
                roomType: document.getElementById('roomType').value,
                gender: document.getElementById('gender').value,
                
                manualTags: Array.from(selectedTags),
                
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'open',
                likeCount: 0,
                likedBy: [],
                
                // GeoFirePoint format required for querying
                position: geoPoint ? {
                    geopoint: new firebase.firestore.GeoPoint(geoPoint.lat, geoPoint.lng)
                } : null
            };

            // 2. Create Document Reference
            const postRef = await db.collection('posts').add(postData);
            const postId = postRef.id;
            console.log("Document created with ID: ", postId);

            // 3. Upload Images
            const imageUrls = await uploadImages(postId);

            // 4. Update Document with Image URLs
            await postRef.update({
                imageUrls: imageUrls
            });

            alert('Listing posted successfully!');
            window.location.href = 'profile.html'; // Redirect back

        } catch (error) {
            console.error("Error posting listing: ", error);
            alert("Failed to post listing. Check console for details.");
            submitBtn.textContent = 'Post Listing';
            submitBtn.disabled = false;
            isPosting = false;
        }
    });
}

// --- Image Upload Logic ---
async function uploadImages(postId) {
    const urls = [];
    let index = 0;

    for (const file of selectedFiles) {
        const ext = file.name.split('.').pop();
        const path = `posts/${postId}/image_${index}.${ext}`;
        const ref = storage.ref().child(path);

        try {
            const snapshot = await ref.put(file);
            const url = await snapshot.ref.getDownloadURL();
            urls.push(url);
            index++;
        } catch (err) {
            console.error("Upload failed for file:", file.name, err);
        }
    }
    return urls;
}