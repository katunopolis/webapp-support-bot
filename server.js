const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Root route - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Chat route - serve chat.html
app.get('/chat/:requestId', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// Start server
app.listen(port, () => {
    console.log(`Web app server running on port ${port}`);
}); 