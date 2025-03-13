// Access the Telegram Web App API
let tg = window.Telegram.WebApp;

// Initialize Telegram WebApp
function initTelegramWebApp() {
    try {
        if (!tg) {
            throw new Error('Telegram WebApp not found');
        }
        
        // Expand the web app to full screen if possible
        tg.expand();
        
        // Log initialization status
        console.log('Telegram WebApp initialized:', {
            initData: tg.initData,
            initDataUnsafe: tg.initDataUnsafe,
            platform: tg.platform,
            version: tg.version,
            colorScheme: tg.colorScheme,
            themeParams: tg.themeParams,
            isExpanded: tg.isExpanded,
            viewportHeight: tg.viewportHeight,
            viewportStableHeight: tg.viewportStableHeight,
            headerColor: tg.headerColor,
            backgroundColor: tg.backgroundColor,
            isClosingConfirmationEnabled: tg.isClosingConfirmationEnabled
        });
        
        return true;
    } catch (error) {
        console.error('Error initializing Telegram WebApp:', error);
        return false;
    }
}

// Get DOM elements
const issueInput = document.getElementById("issue");
const submitButton = document.getElementById("submit");
const statusDiv = document.getElementById("status");
const errorDiv = document.getElementById("error");

// Initialize when the page loads
window.addEventListener('load', () => {
    if (!initTelegramWebApp()) {
        showError('Failed to initialize Telegram WebApp');
        return;
    }
    statusDiv.textContent = "Ready to submit your request";
});

// Handle form submission
submitButton.addEventListener("click", async () => {
    const issueText = issueInput.value.trim();

    if (!issueText) {
        showError("Please describe your issue.");
        return;
    }

    // Check if Telegram WebApp is properly initialized
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        showError("Error: Telegram WebApp not properly initialized");
        return;
    }

    // Disable submit button and show loading state
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    statusDiv.textContent = "Submitting your request...";
    hideError();

    try {
        // Prepare the data to send to your backend API
        const data = {
            user_id: tg.initDataUnsafe.user.id,
            issue: issueText
        };

        console.log('Submitting data:', data);

        // Send the support request to your backend
        const response = await fetch("https://supportbot-production-b784.up.railway.app/support-request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log('Response:', result);

        if (response.ok) {
            // Show success message
            statusDiv.textContent = "Request submitted successfully! Redirecting to chat...";
            
            // Redirect to chat interface after a short delay
            setTimeout(() => {
                window.location.href = result.chat_url;
            }, 1500);
        } else {
            showError(result.message || "Error submitting request");
            submitButton.disabled = false;
            submitButton.textContent = "Submit";
        }
    } catch (error) {
        console.error("Error submitting request:", error);
        showError("An error occurred. Please try again.");
        submitButton.disabled = false;
        submitButton.textContent = "Submit";
    }
});

// Handle enter key in textarea
issueInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitButton.click();
    }
});

// Error handling functions
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
}

function hideError() {
    errorDiv.style.display = "none";
}