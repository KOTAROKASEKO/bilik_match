// bilikmatch_web/reservation.js
import { 
    getFirestore, collection, query, where, getDocs, addDoc, doc, 
    updateDoc, deleteDoc, runTransaction, Timestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const db = getFirestore();
const auth = getAuth();

let state = {
    agentId: "", 
    isAgentView: false,
    selectedDate: new Date(),
    slots: [], 
    user: null
};

export function initReservation(targetAgentId) {
    state.agentId = targetAgentId;
    
    // Auth Listener
    onAuthStateChanged(auth, (user) => {
        state.user = user;
        if (user && user.uid === targetAgentId) {
            setAgentView(true);
            const toggle = document.getElementById('agentViewToggle');
            if(toggle) toggle.checked = true;
        } else {
            setAgentView(false);
        }
        // ★ FIXED: Changed 'render()' to 'renderSlots()'
        renderSlots(); 
    });

    const toggle = document.getElementById('agentViewToggle');
    if(toggle) {
        toggle.addEventListener('change', (e) => {
            setAgentView(e.target.checked);
        });
    }

    renderDateSelector();
    fetchSlotsForDate(state.selectedDate);

    const bookingForm = document.getElementById('bookingForm');
    if(bookingForm) {
        bookingForm.addEventListener('submit', handleBookingSubmit);
    }
}

function setAgentView(isAgent) {
    state.isAgentView = isAgent;
    const title = document.getElementById('reservationTitle');
    if(title) title.innerText = isAgent ? "Manage Viewing Slots" : "Book a Viewing";
    
    const container = document.getElementById('slotsContainer');
    if(container) container.className = `slots-container ${isAgent ? 'agent-view' : 'tenant-view'}`;
    
    renderSlots();
}

function renderDateSelector() {
    const list = document.getElementById('dateList');
    if(!list) return;
    list.innerHTML = '';
    
    for (let i = 0; i < 14; i++) {
        // Create a separate date object for each day
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        const el = document.createElement('div');
        // Compare dates without time
        const isSelected = date.toDateString() === state.selectedDate.toDateString();
        el.className = `date-chip ${isSelected ? 'selected' : ''}`;
        
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();
        
        el.innerHTML = `<span>${dayName}</span><span>${dayNum}</span>`;
        
        // Use a closure to capture the specific date for this iteration
        el.onclick = () => {
            state.selectedDate = new Date(date); // Clone it to be safe
            renderDateSelector(); 
            fetchSlotsForDate(state.selectedDate);
        };
        list.appendChild(el);
    }
}

async function fetchSlotsForDate(date) {
    const container = document.getElementById('slotsContainer');
    if(container) container.innerHTML = '<div class="loading-spinner">Loading...</div>';

    const startOfDay = new Date(date);
    startOfDay.setHours(0,0,0,0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23,59,59,999);

    const q = query(
        collection(db, "reservation_slots"),
        where("agentId", "==", state.agentId),
        where("startTime", ">=", Timestamp.fromDate(startOfDay)),
        where("startTime", "<=", Timestamp.fromDate(endOfDay))
    );

    try {
        const snapshot = await getDocs(q);
        state.slots = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            startTime: doc.data().startTime.toDate()
        }));
        renderSlots();
    } catch (e) {
        console.error("Fetch error:", e);
        if(container) container.innerHTML = '<div style="color:red">Error loading slots</div>';
    }
}

function renderSlots() {
    const container = document.getElementById('slotsContainer');
    if(!container) return;
    container.innerHTML = '';

    const hours = Array.from({length: 9}, (_, i) => 10 + i);

    hours.forEach(hour => {
        const existingSlot = state.slots.find(s => s.startTime.getHours() === hour);
        
        const chip = document.createElement('div');
        chip.className = 'slot-chip';
        
        let label = `${hour}:00`;
        let statusClass = 'status-none';
        
        if (state.isAgentView) {
            if (!existingSlot) {
                statusClass = 'status-none';
                label += '<br>Add';
            } else {
                switch(existingSlot.status) {
                    case 'available': 
                        statusClass = 'status-available'; 
                        label += '<br>Open'; 
                        break;
                    case 'pending': 
                        statusClass = 'status-pending'; 
                        label += '<br>Request'; 
                        break;
                    case 'booked': 
                        statusClass = 'status-booked'; 
                        label += '<br>Booked'; 
                        break;
                }
            }
        } else {
            if (!existingSlot) {
                statusClass = 'status-none';
            } else {
                const isMyBooking = state.user && existingSlot.tenantId === state.user.uid;
                
                if (existingSlot.status === 'available') {
                    statusClass = 'status-available';
                } else if (existingSlot.status === 'pending') {
                    statusClass = isMyBooking ? 'status-pending-mine' : 'status-taken';
                    if(isMyBooking) label += '<br>Pending';
                    else label += '<br>Taken';
                } else if (existingSlot.status === 'booked') {
                    statusClass = isMyBooking ? 'status-booked-mine' : 'status-taken';
                    if(isMyBooking) label += '<br>Confirmed';
                    else label += '<br>Taken';
                }
            }
        }

        chip.classList.add(statusClass);
        chip.innerHTML = label;
        chip.onclick = () => handleSlotClick(hour, existingSlot);
        container.appendChild(chip);
    });
}

function handleSlotClick(hour, slot) {
    if (state.isAgentView) {
        handleAgentClick(hour, slot);
    } else {
        handleTenantClick(hour, slot);
    }
}

async function handleAgentClick(hour, slot) {
    if (!slot) {
        const time = new Date(state.selectedDate);
        time.setHours(hour, 0, 0, 0);
        await addDoc(collection(db, "reservation_slots"), {
            agentId: state.agentId,
            startTime: Timestamp.fromDate(time),
            status: 'available'
        });
        fetchSlotsForDate(state.selectedDate); 
    } else if (slot.status === 'available') {
        if(confirm("Close this slot?")) {
            await deleteDoc(doc(db, "reservation_slots", slot.id));
            fetchSlotsForDate(state.selectedDate);
        }
    } else if (slot.status === 'pending') {
        openApprovalModal(slot);
    } else if (slot.status === 'booked') {
        openDetailsModal(slot, true);
    }
}

function handleTenantClick(hour, slot) {
    if (!slot) return; 
    if (!state.user) {
        alert("Please login to book.");
        return;
    }

    const isMyBooking = slot.tenantId === state.user.uid;

    if (slot.status === 'available') {
        const time = new Date(state.selectedDate);
        time.setHours(hour, 0, 0, 0);
        openBookingModal(slot.id, time);
    } else if (isMyBooking) {
        openDetailsModal(slot, false);
    }
}

function openBookingModal(slotId, time) {
    document.getElementById('bookingSlotId').value = slotId;
    document.getElementById('bookingDateDisplay').innerText = time.toLocaleString();
    document.getElementById('bookingModal').classList.add('show');
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    const slotId = document.getElementById('bookingSlotId').value;
    const prop = document.getElementById('propName').value;
    const meet = document.getElementById('meetPoint').value;
    const msg = document.getElementById('msg').value;

    try {
        const slotRef = doc(db, "reservation_slots", slotId);
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(slotRef);
            if (!sfDoc.exists() || sfDoc.data().status !== 'available') {
                throw "Slot is no longer available.";
            }
            transaction.update(slotRef, {
                status: 'pending',
                tenantId: state.user.uid,
                tenantName: state.user.displayName || "Unknown",
                propertyName: prop,
                meetingPoint: meet,
                message: msg
            });
        });
        closeModal('bookingModal');
        document.getElementById('bookingForm').reset();
        fetchSlotsForDate(state.selectedDate);
        alert("Request sent!");
    } catch (err) {
        alert("Booking failed: " + err);
    }
}

function openApprovalModal(slot) {
    document.getElementById('reqTenant').innerText = slot.tenantName;
    document.getElementById('reqProp').innerText = slot.propertyName;
    document.getElementById('reqMeet').innerText = slot.meetingPoint;
    document.getElementById('reqMsg').innerText = slot.message || "-";
    
    document.getElementById('btnReject').onclick = () => rejectRequest(slot.id);
    document.getElementById('btnApprove').onclick = () => approveRequest(slot.id);
    
    document.getElementById('approvalModal').classList.add('show');
}

function openDetailsModal(slot, isAgent) {
    document.getElementById('detTenant').innerText = slot.tenantName;
    document.getElementById('detProp').innerText = slot.propertyName;
    document.getElementById('detMeet').innerText = slot.meetingPoint;
    document.getElementById('detMsg').innerText = slot.message || "-";

    const btn = document.getElementById('btnCancelBooking');
    btn.onclick = () => cancelBooking(slot.id);
    btn.innerText = isAgent ? "Cancel Reservation" : "Cancel Request";

    document.getElementById('detailsModal').classList.add('show');
}

async function approveRequest(slotId) {
    await updateDoc(doc(db, "reservation_slots", slotId), { status: 'booked' });
    closeModal('approvalModal');
    fetchSlotsForDate(state.selectedDate);
}

async function rejectRequest(slotId) {
    await cancelBooking(slotId);
    closeModal('approvalModal');
}

async function cancelBooking(slotId) {
    await updateDoc(doc(db, "reservation_slots", slotId), {
        status: 'available',
        tenantId: deleteField(),
        tenantName: deleteField(),
        propertyName: deleteField(),
        meetingPoint: deleteField(),
        message: deleteField()
    });
    closeModal('detailsModal');
    fetchSlotsForDate(state.selectedDate);
}

// Global window function for inline onclick="closeModal(...)"
window.closeModal = (id) => {
    document.getElementById(id).classList.remove('show');
}