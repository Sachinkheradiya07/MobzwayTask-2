const socket = io();

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
  const userId = document.getElementById("userId").value;
  socket.emit("registerUser", userId);
});

socket.on("userDetails", (data) => {
  document.getElementById("name").innerText = `Name: ${data.name}`;
  document.getElementById("email").innerText = `Email: ${data.email}`;
  document.getElementById("socketId").innerText = `Socket ID: ${data.socketId}`;
});

socket.on("updateUserList", (users) => {
  const userList = document.getElementById("userList");
  userList.innerHTML = "";
  users.forEach((user) => {
    const userElement = document.createElement("div");
    userElement.classList.add("user-item");
    userElement.textContent = `${user.name} (${user.email}) - ${user.socketId}`;
    userElement.onclick = () => {
      showUserDetails(user.userId);
    };
    userList.appendChild(userElement);
  });
});

function showUserDetails(userId) {
  socket.emit("getUserDetails", userId);
  socket.once("userDetailResponse", (user) => {
    document.getElementById("popupName").textContent = user.name;
    document.getElementById("popupEmail").textContent = user.email;
    document.getElementById("popupMobileNo").textContent = user.mobileNo;
    document.getElementById("popupAddress").textContent = user.address;
    document.getElementById("popupLoginId").textContent = user.loginId;

    document.getElementById("userPopup").style.display = "block";
    document.querySelector(".overlay").style.display = "block";

    popupName.textContent = user.name;
    popupEmail.textContent = user.email;
    popupMobileNo.textContent = user.mobileNo;
    popupAddress.textContent = user.address;
    popupLoginId.textContent = user.loginId;

    userPopup.style.display = "block";
    overlay.style.display = "block";

    overlay.onclick = closePopup;
  });
}

function closePopup() {
  document.getElementById("userPopup").style.display = "none";
  document.querySelector(".overlay").style.display = "none";
}

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});
