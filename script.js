// Access the Telegram Web App API
const tg = window.Telegram.WebApp;
tg.expand(); // Expand the web app to full screen if possible

document.getElementById("submit").addEventListener("click", () => {
  const issueText = document.getElementById("issue").value.trim();

  if (!issueText) {
    alert("Please describe your issue.");
    return;
  }

  // Prepare the data to send to your backend API
  const data = {
    user_id: tg.initDataUnsafe.user.id, // Get Telegram user info
    issue: issueText
  };

  // Send the support request to your backend
  fetch("https://supportbot-production-b784.up.railway.app/support-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })
    .then(response => response.json())
    .then(result => {
      alert(result.message || "Request submitted successfully!");
      tg.close(); // Optionally close the Web App after submission
    })
    .catch(error => {
      console.error("Error submitting request:", error);
      alert("An error occurred. Please try again.");
    });
});
