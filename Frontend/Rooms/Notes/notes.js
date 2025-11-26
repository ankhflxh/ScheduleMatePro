// File: Frontend/Rooms/Notes/notes.js
const token = localStorage.getItem("sm_token");
const roomId = new URLSearchParams(window.location.search).get("roomId");
let currentUserId = null;

if (!token) window.location.href = "/LoginPage/login.html";
if (!roomId) alert("Room ID missing");

// UI Elements
const notesGrid = document.getElementById("notesGrid");
const addNoteFab = document.getElementById("addNoteFab");
const noteModal = document.getElementById("noteModal");
const deleteModal = document.getElementById("deleteModal");
const noteContent = document.getElementById("noteContent");
const noteTitle = document.getElementById("noteTitle");
const modalTitle = document.getElementById("modalTitle");

// Upload Elements
const noteImageInput = document.getElementById("noteImageInput");
const triggerUploadBtn = document.getElementById("triggerUploadBtn");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");

const saveNoteBtn = document.getElementById("saveNoteBtn");
const cancelNoteBtn = document.getElementById("cancelNoteBtn");
const confirmDelete = document.getElementById("confirmDelete");
const cancelDelete = document.getElementById("cancelDelete");

let editingNoteId = null;
let deletingNoteId = null;
let selectedColor = "#ffffff";
let selectedFile = null; // Store the file here

// --- INIT ---
function init() {
  fetch("/api/users/me", { headers: { "X-Auth-Token": token } })
    .then((res) => res.json())
    .then((user) => {
      currentUserId = user.user_id || user.id;
      loadNotes();
    });
}

// --- LOAD NOTES ---
function loadNotes() {
  fetch(`/api/notes/${roomId}`, { headers: { "X-Auth-Token": token } })
    .then((res) => res.json())
    .then((notes) => {
      notesGrid.innerHTML = "";
      if (notes.length === 0) {
        notesGrid.innerHTML =
          "<p style='grid-column: 1/-1; text-align: center; color: #64748b;'>No notes yet. Add one!</p>";
        return;
      }

      notes.forEach((note) => {
        const isAuthor = String(note.user_id) === String(currentUserId);
        const date = new Date(note.created_at).toLocaleDateString();

        const div = document.createElement("div");
        div.className = "note-card";
        div.style.backgroundColor = note.color || "#ffffff";

        let actionsHtml = "";
        if (isAuthor) {
          actionsHtml = `
                        <div class="note-actions">
                            <button class="action-btn" onclick="openEditModal(${
                              note.id
                            }, '${encodeURIComponent(
            note.title || ""
          )}', '${encodeURIComponent(note.content)}', '${note.color}', '${
            note.image_path || ""
          }')">
                                <span class="material-icons" style="font-size: 1.2rem;">edit</span>
                            </button>
                            <button class="action-btn delete" onclick="openDeleteModal(${
                              note.id
                            })">
                                <span class="material-icons" style="font-size: 1.2rem;">delete</span>
                            </button>
                        </div>
                    `;
        }

        const titleHtml = note.title
          ? `<h3 class="note-title">${note.title}</h3>`
          : "";

        // Image Logic
        let imageHtml = "";
        if (note.image_path) {
          imageHtml = `<img src="${note.image_path}" class="note-image" onclick="window.open('${note.image_path}', '_blank')">`;
        }

        div.innerHTML = `
                    <div class="note-body">
                        ${titleHtml}
                        ${imageHtml}
                        <div class="note-content">${note.content}</div>
                    </div>
                    <div class="note-footer">
                        <span class="note-author">${note.username} • ${date}</span>
                        ${actionsHtml}
                    </div>
                `;
        notesGrid.appendChild(div);
      });
    });
}

// --- FILE UPLOAD HANDLERS ---
triggerUploadBtn.onclick = () => noteImageInput.click();

noteImageInput.onchange = (e) => {
  if (e.target.files && e.target.files[0]) {
    selectedFile = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreviewContainer.style.display = "flex";
      triggerUploadBtn.style.display = "none";
    };
    reader.readAsDataURL(selectedFile);
  }
};

removeImageBtn.onclick = () => {
  selectedFile = null;
  noteImageInput.value = "";
  imagePreview.src = "";
  imagePreviewContainer.style.display = "none";
  triggerUploadBtn.style.display = "flex";
};

// --- ADD / EDIT MODAL ---
addNoteFab.onclick = () => {
  editingNoteId = null;
  noteTitle.value = "";
  noteContent.value = "";
  modalTitle.textContent = "Add Note";

  // Reset Image
  removeImageBtn.click();

  resetColorPicker();
  noteModal.style.display = "flex";
};

window.openEditModal = (id, title, content, color, imagePath) => {
  editingNoteId = id;
  noteTitle.value = decodeURIComponent(title);
  noteContent.value = decodeURIComponent(content);
  modalTitle.textContent = "Edit Note";
  setColor(color);

  // Reset existing file input
  selectedFile = null;
  noteImageInput.value = "";

  // Show existing image preview if available
  if (imagePath) {
    imagePreview.src = imagePath;
    imagePreviewContainer.style.display = "flex";
    triggerUploadBtn.style.display = "none";
  } else {
    removeImageBtn.click();
  }

  noteModal.style.display = "flex";
};

cancelNoteBtn.onclick = () => (noteModal.style.display = "none");

saveNoteBtn.onclick = () => {
  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();

  if (!content && !title && !selectedFile && imagePreview.src === "") {
    return alert("Note cannot be empty.");
  }

  const method = editingNoteId ? "PUT" : "POST";
  const url = editingNoteId
    ? `/api/notes/${editingNoteId}`
    : `/api/notes/${roomId}`;

  // USE FORMDATA for File Uploads
  const formData = new FormData();
  formData.append("title", title);
  formData.append("content", content);
  formData.append("color", selectedColor);

  if (selectedFile) {
    formData.append("image", selectedFile);
  }

  fetch(url, {
    method: method,
    headers: {
      // "Content-Type": "multipart/form-data" // Do NOT set this manually when using FormData!
      "X-Auth-Token": token,
    },
    body: formData,
  }).then((res) => {
    if (res.ok) {
      noteModal.style.display = "none";
      loadNotes();
    } else {
      alert("Failed to save note");
    }
  });
};

// --- DELETE & COLOR PICKER (Unchanged) ---
window.openDeleteModal = (id) => {
  deletingNoteId = id;
  deleteModal.style.display = "flex";
};
cancelDelete.onclick = () => (deleteModal.style.display = "none");
confirmDelete.onclick = () => {
  if (!deletingNoteId) return;
  fetch(`/api/notes/${deletingNoteId}`, {
    method: "DELETE",
    headers: { "X-Auth-Token": token },
  }).then((res) => {
    if (res.ok) {
      deleteModal.style.display = "none";
      loadNotes();
    } else {
      alert("Failed to delete");
    }
  });
};

const colorDots = document.querySelectorAll(".color-dot");
colorDots.forEach((dot) => {
  dot.onclick = () => setColor(dot.dataset.color);
});
function setColor(color) {
  selectedColor = color || "#ffffff";
  colorDots.forEach((d) => d.classList.remove("selected"));
  const active = document.querySelector(
    `.color-dot[data-color="${selectedColor}"]`
  );
  if (active) active.classList.add("selected");
}
function resetColorPicker() {
  setColor("#ffffff");
}

init();
